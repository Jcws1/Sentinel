"""Download the bounded Copernicus GLO-30 DEM and build offline MapLibre terrain tiles."""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import boto3
import mercantile
import numpy as np
import rasterio
from botocore.config import Config
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.merge import merge
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject


ROOT = Path(__file__).resolve().parents[1]
BOUNDS = (103.45, 1.10, 104.25, 1.65)
MIN_ZOOM = 8
MAX_ZOOM = 12
DEM_KEYS = (
    "auxdata/CopDEM_COG/copernicus-dem-30m/Copernicus_DSM_COG_10_N01_00_E103_00_DEM/Copernicus_DSM_COG_10_N01_00_E103_00_DEM.tif",
    "auxdata/CopDEM_COG/copernicus-dem-30m/Copernicus_DSM_COG_10_N01_00_E104_00_DEM/Copernicus_DSM_COG_10_N01_00_E104_00_DEM.tif",
)


def load_local_env() -> None:
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def s3_client():
    access_key = os.environ.get("CDSE_S3_ACCESS_KEY")
    secret_key = os.environ.get("CDSE_S3_SECRET_KEY")
    if not access_key or not secret_key:
        raise RuntimeError("CDSE_S3_ACCESS_KEY and CDSE_S3_SECRET_KEY are required")
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("CDSE_S3_ENDPOINT", "https://eodata.dataspace.copernicus.eu"),
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="default",
        config=Config(s3={"addressing_style": "path"}),
    )


def download_dem_files() -> list[Path]:
    cache = Path(tempfile.gettempdir()) / "sentinel-cdse-dem"
    cache.mkdir(parents=True, exist_ok=True)
    client = s3_client()
    outputs: list[Path] = []
    for key in DEM_KEYS:
        output = cache / key.rsplit("/", 1)[-1]
        expected = client.head_object(Bucket="eodata", Key=key)["ContentLength"]
        if not output.exists() or output.stat().st_size != expected:
            print(f"Downloading {output.name} ({expected / 1_000_000:.1f} MB)")
            client.download_file("eodata", key, str(output))
        else:
            print(f"Using cached {output.name}")
        outputs.append(output)
    return outputs


def terrain_rgb(elevation: np.ndarray) -> np.ndarray:
    safe = np.nan_to_num(elevation, nan=0.0, posinf=0.0, neginf=0.0)
    encoded = np.clip(np.rint((safe + 10_000.0) * 10.0), 0, 16_777_215).astype(np.uint32)
    rgb = np.empty((*encoded.shape, 3), dtype=np.uint8)
    rgb[:, :, 0] = encoded >> 16
    rgb[:, :, 1] = (encoded >> 8) & 255
    rgb[:, :, 2] = encoded & 255
    return rgb


def build_tiles(dem_files: list[Path]) -> int:
    sources = [rasterio.open(path) for path in dem_files]
    try:
        mosaic, transform = merge(sources, bounds=BOUNDS, nodata=-32768)
        profile = sources[0].profile.copy()
        profile.update(driver="GTiff", height=mosaic.shape[1], width=mosaic.shape[2], count=1, transform=transform, nodata=-32768)
        memory_file = MemoryFile()
        dataset = memory_file.open(**profile)
        dataset.write(mosaic[0], 1)
    finally:
        for source in sources:
            source.close()

    staging = ROOT / "edge-map" / "data" / "terrain.next"
    target = ROOT / "edge-map" / "data" / "terrain"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    count = 0
    try:
        for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
            coverage = list(mercantile.tiles(*BOUNDS, zooms=zoom))
            min_x = min(tile.x for tile in coverage) - 1
            max_x = max(tile.x for tile in coverage) + 1
            min_y = min(tile.y for tile in coverage) - 1
            max_y = max(tile.y for tile in coverage) + 1
            padded_tiles = (
                mercantile.Tile(x=x, y=y, z=zoom)
                for x in range(min_x, max_x + 1)
                for y in range(min_y, max_y + 1)
            )
            for tile in padded_tiles:
                bounds = mercantile.xy_bounds(tile)
                destination = np.full((256, 256), -32768, dtype=np.float32)
                reproject(
                    source=rasterio.band(dataset, 1), destination=destination,
                    src_transform=dataset.transform, src_crs=dataset.crs, src_nodata=-32768,
                    dst_transform=from_bounds(bounds.left, bounds.bottom, bounds.right, bounds.top, 256, 256),
                    dst_crs="EPSG:3857", dst_nodata=-32768, resampling=Resampling.bilinear,
                )
                destination[destination == -32768] = 0
                output = staging / str(zoom) / str(tile.x) / f"{tile.y}.png"
                output.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(terrain_rgb(destination), mode="RGB").save(output, optimize=True)
                count += 1
            print(f"Generated terrain zoom {zoom}")
    finally:
        dataset.close()
        memory_file.close()

    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(staging, target)
    shutil.rmtree(staging)
    return count


if __name__ == "__main__":
    load_local_env()
    tile_count = build_tiles(download_dem_files())
    print(f"Installed {tile_count} offline terrain tiles for {BOUNDS}")
