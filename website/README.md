# Orbit0 website

The public, pre-login site for Orbit0. Plain HTML, CSS and JavaScript with no build step.

The layout, type and motion follow the structure of humblytics.com (Inter, a centred hero whose headline swaps when you press the second button, a grey "frame" holding white product cards, an accordion beside a changing widget, two side-by-side timelines, a connector diagram with moving packets, an Ask AI panel, an interactive figure, FAQ and a split closing card). All copy, product widgets and code are Orbit0's own.

```
website/
  index.html   page markup
  styles.css   design tokens (light and dark) and all styles
  main.js      animations, accordions, Ask AI switcher, week-to-report figure, request-access form
```

## Run it

Open `index.html` in a browser, or serve the folder:

```
npx serve website
```

## Settings

At the top of `main.js`:

- `signInUrl`: where **Sign in** goes (the portal login).
- `demoUrl`: where the live-demo buttons go; the role (`admin`, `manager`, `employee`) is appended.
- `accessEndpoint`: URL that receives `POST { "email": "..." }` from the request-access form. While it is empty the form only shows the thank-you message, so requests are **not stored anywhere yet**.

## Notes

- All names and numbers in the product widgets are sample data.
- Motion is turned off for visitors who set "reduce motion" in their OS.
- Dark mode follows the system setting.
