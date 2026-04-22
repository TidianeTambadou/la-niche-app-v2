# Design System Document: Technical Purity & Visual Silence

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Clinical Atelier."** 

This system rejects the cluttered noise of traditional e-commerce in favor of a high-perfumery experience that feels engineered rather than merely "designed." Inspired by the technical rigor of Swiss performance brands and the ethereal nature of scent, we prioritize "Visual Silence." By utilizing extreme whitespace, ultra-precise typography, and a "white-out" color palette, we create a vacuum where the product photography becomes the only point of sensory focus. 

We break the "template" look through **Asymmetric Precision**. Instead of centered, predictable grids, we use deliberate offsets and varying typographic scales to guide the eye through a space that feels like a high-end gallery or a scent laboratory.

---

## 2. Colors
Our palette is a study in monochromatic nuance. While the interface appears "white," it is built on a sophisticated hierarchy of neutral tones to provide depth without adding visual weight.

| Token | Hex | Role |
| :--- | :--- | :--- |
| `background` | #FFFFFF | The base canvas. Pure, clinical, and expansive. |
| `surface` | #F9F9F9 | Subtle differentiation for secondary layout blocks. |
| `primary` | #000000 | Absolute black for high-contrast Swiss typography. |
| `outline-variant` | #E5E5E5 | Technical separation and "Ghost Borders." |
| `surface-container-lowest` | #FFFFFF | Active card states or floating modules. |
| `surface-container-high` | #E8E8E8 | Deeply recessed technical areas (e.g., spec sheets). |

### The "No-Line" Rule for Layout
Standard 1px borders for sectioning are strictly prohibited. Boundaries between major content blocks must be defined by shifting from `background` (#FFFFFF) to `surface-container-low` (#F3F3F4). Lines are reserved exclusively for "technical separation"—marking specific data points or functional inputs, never for simply "boxing" content.

### Signature Textures & Glassmorphism
To evoke the glass vials of high perfumery, use **Glassmorphism** for floating navigation and overlays. Apply a `surface` color at 70% opacity with a 20px backdrop-blur. This ensures the immersive photography bleeds through the UI, maintaining a sense of atmospheric depth.

---

## 3. Typography
We utilize a "Swiss-Clinical" typographic approach. By using **Inter** with tight tracking (-0.02em) and high-contrast sizing, we achieve a look that feels like a technical manual for a luxury object.

*   **Display Scales (`display-lg`, `display-md`):** These are your "Statement" sizes. Use them for product names or scent families. They should sit in ample whitespace, often offset to the left or right to create an editorial feel.
*   **The Technical Label (`label-md`, `label-sm`):** All caps, increased letter spacing (+0.05em). Use these for scent notes, ingredients, and technical specifications (e.g., "75ML / 2.5 FL.OZ").
*   **Body Copy:** Keep `body-md` strictly for descriptions. It should always be set in `on-surface-variant` (#474747) to ensure the headings (`primary`) remain the dominant visual anchor.

---

## 4. Elevation & Depth
In this design system, depth is achieved through **Tonal Layering**, not structural shadows. We treat the UI as a series of stacked, semi-transparent sheets.

*   **The Layering Principle:** To lift an element, move it up the surface tier. Place a `surface-container-lowest` card on top of a `surface-container-low` section. The contrast is felt, not seen.
*   **Ambient Shadows:** If a floating element (like a shopping bag) requires a shadow, it must be invisible to the untrained eye. 
    *   *Specs:* `Y: 20px, Blur: 40px, Color: #000000 at 4% opacity`.
*   **The Ghost Border:** For technical containment (e.g., image frames or input fields), use the `outline-variant` (#E5E5E5). It should feel like a "whisper" of a line, providing structure without interrupting the "Visual Silence."

---

## 5. Components

### Buttons
*   **Primary:** Solid `primary` (#000000) with `on-primary` (#E2E2E2) text. Shape: `full` (9999px) for a technical, ergonomic feel reminiscent of performance gear.
*   **Secondary:** `none` background with a 1px `outline-variant` border. Use for less critical actions like "View Notes."
*   **Tertiary:** Text-only with a micro-underline (1px) that appears on hover.

### Technical Input Fields
*   **State:** Default fields use `background` (#FFFFFF) with a 1px `outline-variant` (#E5E5E5) bottom border only.
*   **Focus:** Transition the bottom border to `primary` (#000000). Avoid "boxed" inputs to keep the layout feeling open.

### Immersive Photography Containers
*   **Aspect Ratios:** Use non-standard ratios (e.g., 4:5 or 2:3) to mirror high-fashion editorial.
*   **Radius:** Use `sm` (0.125rem) for a sharp, clinical edge, or `none` (0px) for full-bleed immersion.
*   **The "Technical Spec" Overlay:** Small labels (`label-sm`) should be placed in the corners of images, identifying photographers or scent profiles, mimicking the labeling on a chemical beaker.

### Cards & Lists
*   **The Divider Rule:** Forbid the use of horizontal divider lines. Separate list items using `spacing-lg` (vertical whitespace) or subtle background shifts using `surface-container-low`.

---

## 6. Do's and Don'ts

### Do:
*   **Embrace the Void:** If a section feels "empty," it’s likely working. Use whitespace as a functional element to separate "Odor" from "Technical Data."
*   **Align to a Rigid Grid:** While layouts are asymmetric, every element must snap to a strict 8px grid. Precision is the soul of this system.
*   **Use Mono-spacing:** For numerical data (prices, ml, percentages), consider a mono-spaced variant of the font to enhance the "Lab" aesthetic.

### Don't:
*   **Don't use Gradients:** Except for extremely subtle tonal shifts in CTAs. Avoid any "web 2.0" or "tech-startup" colorful gradients.
*   **Don't use Rounded Corners on Layout:** Keep containers sharp. The `full` rounding is reserved only for buttons and chips to signify "Interactable."
*   **Don't use Icons for Everything:** Favor precise text labels over generic icons. A "Search" label is often more elegant than a magnifying glass in this context.