import { bundleMDX } from "mdx-bundler";
import fs from "fs";
import matter from "gray-matter";
import path from "path";
import readingTime, { ReadTimeResults } from "reading-time";
import getAllFilesRecursively from "./utils/files";
// Remark packages
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import remarkMath from "remark-math";
import remarkExtractFrontmatter from "./remark-extract-frontmatter";
import remarkCodeTitles from "./remark-code-title";
import remarkTocHeadings from "./remark-toc-headings";
import remarkImgToJsx from "./remark-img-to-jsx";

// Rehype packages
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeKatex from "rehype-katex";
import rehypeCitation from "rehype-citation";
import rehypePrismPlus from "rehype-prism-plus";
import rehypePresetMinify from "rehype-preset-minify";

const root = process.cwd();

export function getFiles(type: string) {
  const prefixPaths = path.join(root, "data", type);
  const files = getAllFilesRecursively(prefixPaths);
  // Only want to return blog/path and ignore root, replace is needed to work on Windows
  return files.map((file: string) =>
    file.slice(prefixPaths.length + 1).replace(/\\/g, "/")
  );
}

export function formatSlug(slug: string) {
  return slug.replace(/\.(mdx|md)/, "");
}

export function dateSortDesc(a: number, b: number): number {
  if (a > b) return -1;
  if (a < b) return 1;
  return 0;
}

export async function getFileBySlug(type: string, slug: string) {
  const mdxPath = path.join(root, "data", type, `${slug}.mdx`);
  const mdPath = path.join(root, "data", type, `${slug}.md`);
  const source = fs.existsSync(mdxPath)
    ? fs.readFileSync(mdxPath, "utf8")
    : fs.readFileSync(mdPath, "utf8");

  // https://github.com/kentcdodds/mdx-bundler#nextjs-esbuild-enoent
  if (process.platform === "win32") {
    process.env.ESBUILD_BINARY_PATH = path.join(
      root,
      "node_modules",
      "esbuild",
      "esbuild.exe"
    );
  } else {
    process.env.ESBUILD_BINARY_PATH = path.join(
      root,
      "node_modules",
      "esbuild",
      "bin",
      "esbuild"
    );
  }

  let toc: string[] = [];

  const { code, frontmatter } = await bundleMDX({
    source,
    cwd: path.join(root, "components"),
    mdxOptions(options: any, frontmatter: any) {
      options.remarkPlugins = [
        ...(options.remarkPlugins ?? []),
        remarkExtractFrontmatter,
        [remarkTocHeadings, { exportRef: toc }],
        remarkGfm,
        remarkCodeTitles,
        [remarkFootnotes, { inlineNotes: true }],
        remarkMath,
        remarkImgToJsx,
      ];
      options.rehypePlugins = [
        ...(options.rehypePlugins ?? []),
        rehypeSlug,
        rehypeAutolinkHeadings,
        rehypeKatex,
        [rehypeCitation, { path: path.join(root, "data") }],
        [rehypePrismPlus, { ignoreMissing: true }],
        rehypePresetMinify,
      ];
      return options;
    },
    esbuildOptions: (options) => {
      options.loader = {
        ...options.loader,
        ".js": "jsx",
      };
      return options;
    },
  });

  return {
    mdxSource: code,
    toc,
    frontMatter: {
      readingTime: readingTime(code),
      slug: slug || null,
      fileName: fs.existsSync(mdxPath) ? `${slug}.mdx` : `${slug}.md`,
      ...frontmatter,
      date: frontmatter.date ? new Date(frontmatter.date).toISOString() : null,
    },
  };
}

export interface FrontMatterProps {
  date: string | null;
  draft: boolean;
  slug: string;
  description: string;
  tags: string[];
  title: string;
  time: ReadTimeResults;
  keywords: string[];
  image: string;
}

const getDate = (date: string | null): Date => {
  if (date === null) {
    return new Date();
  }
  return new Date(date);
};

export async function getAllFilesFrontMatter(folder: string) {
  const prefixPaths = path.join(root, "data", folder);

  const files = getAllFilesRecursively(prefixPaths);

  const allFrontMatter: FrontMatterProps[] = [];

  files.forEach((file: string) => {
    // to work on Windows
    const fileName = file.slice(prefixPaths.length + 1).replace(/\\/g, "/");
    // Remove Unexpected File
    if (path.extname(fileName) !== ".md" && path.extname(fileName) !== ".mdx") {
      return;
    }
    const source = fs.readFileSync(file, "utf8");
    const { data: frontmatter, ...rest } = matter(source);
    const {
      date,
      draft = false,
      description = "",
      tags,
      title,
      slug = "",
      keywords = [],
      image = "",
    } = frontmatter;

    if (draft !== true) {
      allFrontMatter.push({
        ...frontmatter,
        slug,
        date: date ? new Date(date).toISOString() : null,
        draft: draft,
        description,
        tags: tags,
        title: title,
        time: readingTime(rest.content),
        keywords,
        image,
      });
    }
  });

  return allFrontMatter.sort((a, b) =>
    dateSortDesc(getDate(a.date).getTime(), getDate(b.date).getTime())
  );
}
