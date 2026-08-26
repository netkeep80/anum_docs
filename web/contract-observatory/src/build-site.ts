import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

import { buildContractObservatoryIndex } from "./contract-index.js";
import { buildMethodologyProjection } from "./methodology-projection.js";
import { renderContractObservatoryHtml } from "./site.js";

export interface MaterializedContractObservatorySite {
  readonly outputDirectory: string;
  readonly indexPath: string;
  readonly noJekyllPath: string;
  readonly indexBytes: number;
}

export function materializeContractObservatorySite(
  repositoryRoot: string,
  outputDirectory: string,
): MaterializedContractObservatorySite {
  const repositoryPath = resolve(repositoryRoot);
  const outputPath = resolve(outputDirectory);
  assertSafeOutputPath(repositoryPath, outputPath);

  const index = buildContractObservatoryIndex(repositoryPath);
  const methodology = buildMethodologyProjection(repositoryPath, index);
  const html = renderContractObservatoryHtml(index, methodology);
  const indexPath = resolve(outputPath, "index.html");
  const noJekyllPath = resolve(outputPath, ".nojekyll");

  mkdirSync(outputPath, { recursive: true });
  writeFileSync(indexPath, html, "utf8");
  writeFileSync(noJekyllPath, "", "utf8");

  return Object.freeze({
    outputDirectory: outputPath,
    indexPath,
    noJekyllPath,
    indexBytes: Buffer.byteLength(html, "utf8"),
  });
}

function assertSafeOutputPath(repositoryRoot: string, outputPath: string): void {
  if (samePath(repositoryRoot, outputPath)) {
    throw new Error("Contract Observatory output must not be the repository root");
  }

  const protectedRoots = [
    resolve(repositoryRoot, "contracts"),
    resolve(repositoryRoot, "cutover"),
    resolve(repositoryRoot, "ts", "src"),
    resolve(repositoryRoot, "ts", "test"),
  ];

  for (const protectedRoot of protectedRoots) {
    if (isAtOrInside(outputPath, protectedRoot)) {
      throw new Error(`Contract Observatory output targets protected source tree: ${protectedRoot}`);
    }
  }
}

function samePath(left: string, right: string): boolean {
  return left === right;
}

function isAtOrInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function runCli(): void {
  const repositoryRoot = process.argv[2] ?? ".";
  const outputDirectory = process.argv[3] ?? "_site";
  const result = materializeContractObservatorySite(repositoryRoot, outputDirectory);
  console.log(`Contract Observatory materialized: ${result.indexPath} (${result.indexBytes} bytes)`);
}

if (require.main === module) {
  runCli();
}
