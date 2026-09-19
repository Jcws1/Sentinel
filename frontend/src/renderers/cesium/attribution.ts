import type { Cesium3DTileset, Viewer } from 'cesium';

/** Keep Cesium's aggregation, links and required showOnScreen credits intact.
 * Google permits a map-local Data sources panel when the full line cannot fit.
 * Only its public tileset credit preference changes; no provider credit is filtered.
 */
export function presentCredits(
  viewer: Viewer,
  container: HTMLElement,
  photorealistic: () => Cesium3DTileset | undefined,
) {
  const owner = container.ownerDocument.defaultView!;
  const credits = viewer.creditDisplay.container;
  const dialog = container.querySelector<HTMLElement>(
    '.cesium-credit-lightbox',
  )!;
  const expand = credits.querySelector<HTMLElement>(
    '.cesium-credit-expand-link',
  )!;
  expand.textContent = 'Data sources';
  dialog.setAttribute('aria-label', 'Data sources');
  const measure = container.ownerDocument
    .createElement('canvas')
    .getContext('2d')!;
  let frame = 0;
  let stopped = false;
  const update = () => {
    frame = 0;
    if (stopped || !container.isConnected || !container.clientWidth) return;
    const creditBounds = credits.getBoundingClientRect();
    const height = creditBounds.height;
    container
      .closest<HTMLElement>('.map-surface, .cockpit-scene')
      ?.style.setProperty('--map-credits-height', `${height}px`);
    const tileset = photorealistic();
    if (!tileset) return;
    // Include both the native on-screen and lightbox lists so opening/collapsing
    // does not change the fit estimate. Cesium still owns all these DOM nodes.
    const entries = new Map<string, Element>();
    for (const element of container.querySelectorAll(
      '.cesium-credit-textContainer > .cesium-credit-wrapper, .cesium-credit-lightbox li > .cesium-credit-wrapper',
    )) {
      if (element.classList.contains('cesium-credit-delimiter')) continue;
      entries.set(element.innerHTML, element);
    }
    const logo = credits.querySelector('.cesium-credit-logoContainer');
    let width = (logo?.getBoundingClientRect().width ?? 100) + 24;
    for (const element of entries.values()) {
      const google = element.querySelector('.google-maps-credit');
      measure.font = google ? '500 14px Arial' : '11px Arial';
      width +=
        measure.measureText(element.textContent ?? '').width +
        (google ? 16 : 10);
      for (const image of element.querySelectorAll('img'))
        width += image.width || 100;
    }
    const availableWidth = container.closest('.cockpit-scene')
      ? creditBounds.width
      : container.clientWidth;
    const show = width <= availableWidth - 12;
    if (tileset.showCreditsOnScreen !== show) {
      tileset.showCreditsOnScreen = show;
      viewer.scene.requestRender();
    }
  };
  const schedule = () => {
    if (!stopped && !frame) frame = owner.requestAnimationFrame(update);
  };
  const mutation = new MutationObserver(schedule);
  mutation.observe(credits, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  mutation.observe(dialog, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  const resize = new ResizeObserver(schedule);
  resize.observe(container);
  resize.observe(credits);
  // Cesium supplies Enter/Space/Escape and return focus. Keep Tab inside its
  // map-local modal too, without intercepting any canvas/navigation keys.
  const trap = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const targets = [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], [tabindex="0"], button',
      ),
    ].filter((el) => el.getClientRects().length > 0);
    if (!targets.length) return;
    const first = targets[0],
      last = targets[targets.length - 1];
    if (event.shiftKey && container.ownerDocument.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      container.ownerDocument.activeElement === last
    ) {
      event.preventDefault();
      first.focus();
    }
  };
  dialog.addEventListener('keydown', trap);
  schedule();
  return () => {
    stopped = true;
    owner.cancelAnimationFrame(frame);
    mutation.disconnect();
    resize.disconnect();
    dialog.removeEventListener('keydown', trap);
  };
}
