import * as cheerio from "cheerio";
import axios, { type AxiosResponse } from "axios";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import mime from "mime";
import contentDisposition from "content-disposition";

const DOWNLOADABLE_FILE_CONTENT_TYPES = ["audio", "video", "image"];

const DOWNLOADABLE_HTML_ELEMENTS = [
  { element: "a", urlAttr: "href" },
  { element: "img", urlAttr: "src" },
  { element: "link", urlAttr: "href" },
  { element: "script", urlAttr: "src" },
] satisfies {
  element: string;
  urlAttr: string;
}[];

type DownloadFileOpts = {
  appliableHeaders?: {
    headers: Record<string, string>;
    shouldApply?: (url: URL) => boolean;
  }[];
  downloadableFileContentTypeStartsWith?: typeof DOWNLOADABLE_FILE_CONTENT_TYPES;
  downloadableFileNamingRule?: "inherit" | "random";
  outputDir: string;
};

const downloadFile = async (url: string, opts: DownloadFileOpts) => {
  const u = new URL(url);
  if (!(u.protocol === "https:" || u.protocol === "http:")) {
    return undefined;
  }

  const headers = opts.appliableHeaders?.reduce(
    (acc, { headers, shouldApply }) => {
      if (typeof shouldApply === "undefined" || shouldApply(u)) {
        return { ...acc, ...headers };
      }
      return acc;
    },
    {} as Record<string, string>
  );

  const response = await axios
    .get(u.href, { headers, responseType: "arraybuffer" })
    .catch((err) => {
      let res = undefined as AxiosResponse | undefined;
      if (err.response) {
        res = err.response;
      } else if (err.message) {
        console.error(err.message);
      }
      return res;
    });

  if (
    !(
      response &&
      response.status === 200 &&
      (
        opts.downloadableFileContentTypeStartsWith ??
        DOWNLOADABLE_FILE_CONTENT_TYPES
      ).some((ct) => {
        return String(response.headers["content-type"]).startsWith(ct);
      })
    )
  ) {
    return undefined;
  }

  const inheritFileName = !response.headers["content-disposition"]
    ? undefined
    : contentDisposition.parse(response.headers["content-disposition"])
        .parameters["filename"];

  const randomFileName = `${crypto.randomUUID()}.${mime.getExtension(
    response.headers["content-type"]
  )}`;

  const fileName =
    opts.downloadableFileNamingRule === "inherit"
      ? inheritFileName ?? randomFileName
      : randomFileName;

  const filePath = path.join(opts.outputDir, fileName);
  fs.writeFileSync(filePath, response.data);
  return { filePath, fileName };
};

type DownloadHtmlOpts = DownloadFileOpts & {
  downloadableHtmlElements?: typeof DOWNLOADABLE_HTML_ELEMENTS;
  shouldClearRelativeFilesDir?: boolean; // default to False
  shouldDownloadRelativeFiles?: boolean; // default to True
  shouldDownloadIndexHtml?: boolean; // default to True
  shouldDownloadInParallel?: boolean; // default to True
  indexHtmlName?: string;
  relativeFilesDirName?: string;
  referenceUrl?: string;
  preRender?: ($: cheerio.CheerioAPI) => Promise<void> | void;
  postRender?: ($: cheerio.CheerioAPI) => Promise<void> | void;
};

export const downloadHtml = async (html: string, opts: DownloadHtmlOpts) => {
  const $ = cheerio.load(html);
  await opts.preRender?.($);

  if (opts.shouldDownloadRelativeFiles !== false) {
    const attachmentDir = path.join(
      opts.outputDir,
      opts.relativeFilesDirName ?? "attachments"
    );

    const downloadPromises = [] as {
      url: URL;
      promise: () => Promise<unknown>;
      postPromise: ((
        props: NonNullable<Awaited<ReturnType<typeof downloadFile>>>
      ) => void)[];
    }[];

    if (opts?.shouldClearRelativeFilesDir && fs.existsSync(attachmentDir)) {
      fs.rmSync(attachmentDir, { recursive: true, force: true });
    }

    if (!fs.existsSync(attachmentDir)) {
      fs.mkdirSync(attachmentDir, { recursive: true });
    }

    // Process downloadable elements, e.g.: image, anchor...
    (opts.downloadableHtmlElements ?? DOWNLOADABLE_HTML_ELEMENTS).forEach(
      ({ element, urlAttr }) => {
        $(element).each((_, ele) => {
          const downloadableUrl = $(ele).attr(urlAttr);
          const url = (() => {
            try {
              return !downloadableUrl
                ? undefined
                : new URL(downloadableUrl, opts?.referenceUrl);
            } catch (_) {
              return undefined;
            }
          })();

          if (url) {
            const downloadPromise = downloadPromises.find(
              (dp) => dp.url.href === url.href
            );

            if (downloadPromise) {
              downloadPromise.postPromise.push((res) =>
                $(ele).attr(
                  urlAttr,
                  path.relative(opts.outputDir, res.filePath)
                )
              );
            } else {
              const newDownloadPromise = () =>
                downloadFile(url.href, {
                  ...opts,
                  outputDir: attachmentDir,
                }).then((res) => {
                  if (res && res.filePath) {
                    $(ele).attr(
                      urlAttr,
                      path.relative(opts.outputDir, res.filePath)
                    );

                    downloadPromises
                      .find((dp) => dp.url.href === url.href)
                      ?.postPromise.forEach((pp) => pp(res));
                  }
                });

              downloadPromises.push({
                url,
                promise: newDownloadPromise,
                postPromise: [],
              });
            }
          }
        });
      }
    );

    // Start to download relative files
    if (opts.shouldDownloadInParallel !== false) {
      await Promise.all(downloadPromises.map((dp) => dp.promise()));
    } else {
      for (const dp of downloadPromises) {
        await dp.promise();
      }
    }
  }

  await opts.postRender?.($);
  if (opts.shouldDownloadIndexHtml !== false) {
    if (!fs.existsSync(opts.outputDir)) {
      fs.mkdirSync(opts.outputDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(opts.outputDir, (opts.indexHtmlName ?? "index") + ".html"),
      $.html()
    );
  }

  return $;
};
