# Orbit0 website

The public, pre-login site for Orbit0. Plain HTML, CSS and JavaScript with no build step.

```
website/
  index.html   page markup
  styles.css   design tokens (light and dark) and all styles
  main.js      animations, product tour, request-access form, theme toggle
```

## Run it

Open `index.html` in a browser, or serve the folder:

```
npx serve website
```

## Settings

At the top of `main.js`:

- `signInUrl`: where **Sign in** goes (the portal login).
- `demoUrl`: where the three live-demo buttons go; the role (`admin`, `manager`, `employee`) is appended.
- `accessEndpoint`: URL that receives `POST { "email": "..." }` from the request-access forms. While it is empty the form only shows the thank-you message, so requests are **not stored anywhere yet**.

## Notes

- All numbers and names in the product widgets are sample data.
- Motion is turned off for visitors who set "reduce motion" in their OS.
- Dark mode follows the system setting; the footer has a Light / System / Dark switch.
