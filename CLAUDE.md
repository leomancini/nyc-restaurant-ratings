# NYC Restaurant Ratings

## Spacing System

All vertical spacing uses the flex gap + `<Spacer />` system. Never use margin for vertical spacing between elements.

- Every container is a flex column with `gap: ${GAP}` (10px)
- Use `<Spacer />` to add extra space (each Spacer = one additional gap unit)
- Multiple `<Spacer />`s stack for larger gaps
- Section headers use `<SectionTitle>` with `<Stars />` on each side. Pass `count` to control the number of stars (e.g. `<Stars count={5} />`). Stars auto-space to fill the available width — fewer stars = wider gaps, more stars = tighter.
- The `GAP` constant in App.jsx controls the grid unit globally
