# Onsite Scope

Phone waveform, vectorscope, RGB parade and histogram for IMAG, LED walls and camera checks.
By LR for Creative Day Technologies.

**Live copy: https://productiontoolz.com/tools/onsite-scope/** (that is the one to use on site).

Everything runs in the phone's browser. Nothing is uploaded anywhere.

## Modes

- **Camera check:** tap the chips of a chip chart shot by the show camera and seen on IMAG. Shade and match
  cameras on the hardware scope at the CCU; this is a check from the house side.
- **LED wall:** evenness, worst section, color shift and banding on a flat field.
- **Content QC:** clipped highlights, crushed blacks, colors at the gamut edge.
- **Stage lighting:** skin level and hue on IMAG.

Step 1 calibrates the phone to the wall with a gray step pattern (and color bars) sent from the processor or
media server. Without it every number includes the phone's own exposure, tone curve and color boost.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The page |
| `tool.css` | This tool's styles |
| `js/app.js` | How it works: analysis, scopes, checks, report |
| `shared/` | Header, palette and logos, copied from the Production Toolz site |

## Run it

The camera needs HTTPS (or `localhost`), and the page loads its scripts as modules, so double-clicking
`index.html` will not work. From this folder:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Where this copy came from

The Production Toolz website (`site/tools/onsite-scope/`) as of Nov 16, 2026, which began as the "Onsite Scope"
Claude artifact. The website copy is the one that gets edited; this one can drift.
