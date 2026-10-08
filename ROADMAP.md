# Deferred work — agreed 8 October 2026

## Offline truck route planner (not part of this release)

User decision: preserve this idea and implement the other agreed changes first.

- No paid map licence, paid routing API or mapping subscription. No live traffic or temporary daily closure feed requested.
- Offline regional maps with occasional versioned updates while connected; display data dates and download sizes.
- Vehicle combination, travelling dimensions, loaded mass, axle limits and permit/network conditions must inform routing.
- Candidate foundations: OpenStreetMap extracts, MapLibre and Valhalla, with NHVR/state access data only where reuse is permitted. Free licences still require compliance; do not bulk-download OSM public tiles.
- Missing clearance/access data is unverified, never an assurance of truck access. Validate regular corridors before enabling guidance; do not fall back to car routing.
- Show suitable truck rest areas and fuel stops along the actual route, including entrance/direction and alternative stops. Unknown capacity stays unknown.
- Compare travel time to stops with the complete diary's applicable fatigue periods and a parking/delay buffer. Vehicle stopped does not imply rest.
- Arrival estimates include planned work, breaks and major rest. Fill draft safe-driving forms only with driver approval; preserve signed forms.
- Begin with a personal, planning-only prototype on existing equipment. Map preparation, mobile offline routing, redistribution rights, update costs and safety validation remain feasibility gates.

## Later workflow improvements

Connected trip records, start/finish-trip review, suggestions for uninvoiced trips, optional reminders and cross-device sync remain separate from the six immediate changes. Existing diary-to-invoice import remains available.
