// The header at the top of every page. A page writes
//
//     <site-header app="Cable Count"></site-header>
//
// and this file fills it in: Creative Day logo (links to the tool menu), the tool's name, an "All tools" link
// and the "Created by" mark. Leave `app` off on the home page. Anything a page puts inside the tag (the venue
// tool's "Upload another PDF" button, for example) is kept and shown on the right.
//
// Its look lives in site.css. Links and images are worked out from where this file sits, so the site works the
// same at the root of a domain, in a sub-folder, or on a local preview.

export const SITE_NAME = 'Production Toolz';

// This copy lives in the onsite-scope repository, so the logo and "All tools" go to the live tool menu.
const HOME = 'https://productiontoolz.com/';
const img = name => new URL(`./img/${name}`, import.meta.url).href;

/** A logo that swaps to its dark-mode version by itself. */
function logo(light, dark, alt) {
  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.srcset = img(dark);
  source.media = '(prefers-color-scheme: dark)';
  const image = document.createElement('img');
  image.src = img(light);
  image.alt = alt;
  picture.append(source, image);
  return picture;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

class SiteHeader extends HTMLElement {
  connectedCallback() {
    if (this.built) return;
    this.built = true;

    const app = this.getAttribute('app');
    const pageExtras = [...this.childNodes];
    this.setAttribute('role', 'banner');

    const brand = el('a', 'brand');
    brand.href = HOME;
    brand.title = `${SITE_NAME}: all tools`;
    brand.append(logo('cd-logo.png', 'cd-logo-dark.png', 'Creative Day Technologies'));

    const name = el('p', 'app', app || SITE_NAME);

    const right = el('div', 'right');
    const extras = el('span', 'extras');
    extras.append(...pageExtras);
    right.append(extras);
    if (app) {
      const all = el('a', 'all', 'All tools');
      all.href = HOME;
      right.append(all);
    }
    const by = el('div', 'by');
    by.append(el('span', '', 'Created by'), logo('lr-mark-light.png', 'lr-mark.png', 'LR'));
    right.append(by);

    this.replaceChildren(brand, name, right);
  }
}

customElements.define('site-header', SiteHeader);
