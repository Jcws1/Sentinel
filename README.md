I'm building Sentinel v2, a command-and-control console for coordinating
counter-UAS drone swarms. One operator supervises 3–30 autonomous
interceptors by issuing high-level intent; the system handles task
allocation and flight. A policy layer bounds what the autonomy is allowed
to do. This session is the visual and structural foundation only — no
domain logic.

AESTHETIC
Dark tactical console, in the vein of Shield AI's Forge/EdgeOS. Near-black
surfaces (~#0A0B0D), not pure black. Very low-contrast borders. Small type,
11–13px, with a monospace face reserved for numerics and IDs. Restrained
colour: Keep it simple for now, let's do mainly black and white for now. 
and nothing else uses those hues. Colour is rare enough that it carries
meaning when it appears.

STACK — use exactly this, do not substitute
- React + TypeScript + Vite
- Tailwind v4, palette defined as CSS custom properties in one token file
- Radix UI primitives for interactive behaviour (unstyled)
- Lucide for icons
- MapLibre GL for the basemap, deck.gl for overlays
No component kit (no MUI, Ant, Chakra, shadcn defaults). Their styling
opinions fight this aesthetic. Build from primitives.

STRUCTURE
Full-bleed map as the background layer. Fixed icon rail pinned left.
Translucent panels floating over the map — not a grid dashboard. This
layering is load-bearing; get it right before anything else.

BUILD, IN THIS ORDER
1. Vite + TS + Tailwind scaffold.
2. src/styles/tokens.css — all colour, spacing, type-scale and border
   tokens as custom properties. Everything downstream reads from here.
3. App frame: map layer beneath, rail left, panel layer above.
4. Icon rail. Home first, then map, then 4–5 further slots
   (VS Code-style thin-stroke icons). Active/hover/inactive states, tooltips
   via Radix. Wire routing as stub views.
5. A single reusable Panel shell: header with title and close, translucent
   background, optional collapse. Every future panel uses this.
6. Map view with MapLibre and a dark style, deck.gl mounted with an empty
   overlay layer.

CONSTRAINTS
- The console must run at a disconnected edge node. No hard dependency on
  a tile CDN — structure the basemap so self-hosted tiles can be dropped in.
- Telemetry will later arrive at ~20Hz for up to 30 entities. Don't design
  a state layer that puts that in React state; leave the seam for a
  ref-based store with per-component subscriptions.
- Selection and order feedback will render optimistically and reconcile on
  backend confirm. Leave room for that; don't build it yet.

Start by proposing the file tree and the token file contents. Wait for my
sign-off before generating components.