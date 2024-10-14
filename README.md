<h1 align="center">🚀 Node-HTML-Downloader</h1>

<h5 align="center">Headless downloader for localizing HTML with all content (images, videos, audios, ...)</h3>

### What's Node-HTML-Downloader?

Node-HTML-Downloader is a node library to localize HTML and download all included content including images, videos, audios, javascript files, css files etc.

Additionally, Node-HTML-Downloader is mainly built on top of [cheerio](https://www.npmjs.com/package/cheerio) (to parsing and manipulating HTML) and [axios](https://www.npmjs.com/package/axios) (acts as an HTTP client to handle file downloads).

### Installation

`npm install node-html-downloader`

### Examples

Download all content on `HTML` to a local folder

```js
import { downloadHtml } from "node-html-downloader";
import axios from "axios";
import path from "path";

const currentPathJoinOutputDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "output"
);

const url = "https://www.npmjs.com/package/node-html-downloader";

const htmlRes = await axios.get(url);

downloadHtml(htmlRes.data, {
  referenceUrl: url,
  outputDir: currentPathJoinOutputDir,
});
```

A more complex example

```js
import { downloadHtml } from "node-html-downloader";
import axios from "axios";
import path from "path";

const currentPathJoinOutputDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "output"
);

const url = "https://www.npmjs.com/package/node-html-downloader";

const htmlRes = await axios.get(url);

downloadHtml(htmlRes.data, {
  appliableHeaders: [
    {
      headers: { Authorization: `Basic SAMPLE_TOKEN` },
      shouldApply: (url) => {
        return (
          url.host.toLowerCase() === "npmjs.com" ||
          url.host.toLowerCase() === "www.npmjs.com"
        );
      },
    },
  ],
  downloadableFileContentTypeStartsWith: [
    "audio",
    "application/pdf",
    "text/plain",
    "video",
    "image",
    "text/css",
    "text/javascript",
  ],
  relativeFilesDirName: "attachments",
  referenceUrl: url,
  outputDir: currentPathJoinOutputDir,
  shouldClearRelativeFilesDir: true,
  preRender: ($) => {
    $("head").append(`
      <style>
        body {
          background-color: antiquewhite;
        }
      </style>
    `);
  },
  postRender: ($) => {
    $("body").append(`
      <script>
        alert("Hello from Node-HTML-Downloader");
      </script>
    `);
  },
});
```
