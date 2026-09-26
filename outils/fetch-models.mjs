#!/usr/bin/env node
/**
 * Télécharge les ressources lourdes du détourage (S3), qui ne sont pas versionnées :
 * - le modèle IS-Net « general use » au format ONNX (≈ 178 Mo, Apache-2.0) ;
 * - la bibliothèque ONNX Runtime (MIT) pour la plateforme courante.
 *
 * Sommes SHA-256 vérifiées. Utilisé par la CI avant le build, et une fois en local
 * (`npm run fetch-models`) avant `npm run tauri dev`. Aucune requête réseau à l'exécution
 * de l'appli : tout est embarqué dans l'installeur.
 *
 * Usage : node scripts/fetch-models.mjs [--platform win|linux] [--cache <dossier>]
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORT_VERSION = "1.28.0";
const RESOURCES = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "resources");

const MODEL = {
  url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
  sha256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
  dest: "models/isnet-general-use.onnx",
};

const ORT = {
  win: {
    url: `https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-win-x64-${ORT_VERSION}.zip`,
    sha256: "abef733dacbe2f571547a7150b479b5cb9cc0df22f96c24983a42cadb1b4f8bc",
    inner: `onnxruntime-win-x64-${ORT_VERSION}/lib/onnxruntime.dll`,
    dest: "onnxruntime/onnxruntime.dll",
  },
  linux: {
    url: `https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/onnxruntime-linux-x64-${ORT_VERSION}.tgz`,
    sha256: "a3e1b79d7bb1bf09696ce675f49e4064e6c81f6202b8225624fff0e93f8d6407",
    inner: `onnxruntime-linux-x64-${ORT_VERSION}/lib/libonnxruntime.so.${ORT_VERSION}`,
    dest: "onnxruntime/libonnxruntime.so",
  },
};

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const platform = arg("--platform", process.platform === "win32" ? "win" : "linux");
const cache = resolve(arg("--cache", join(RESOURCES, "..", "..", ".cache", "figurine-downloads")));

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function download(url, expected) {
  mkdirSync(cache, { recursive: true });
  const file = join(cache, url.split("/").pop());
  if (existsSync(file) && sha256(file) === expected) return file;
  console.log(`Téléchargement de ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const got = sha256(file);
  if (got !== expected) {
    rmSync(file);
    throw new Error(`Somme SHA-256 inattendue pour ${url} : ${got}`);
  }
  return file;
}

function place(src, dest) {
  const target = join(RESOURCES, dest);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(src, target);
  console.log(`→ ${target}`);
}

const model = await download(MODEL.url, MODEL.sha256);
place(model, MODEL.dest);

const ort = ORT[platform];
if (!ort) throw new Error(`Plateforme inconnue : ${platform}`);
const archive = await download(ort.url, ort.sha256);
const extractDir = join(cache, `ort-${platform}`);
rmSync(extractDir, { recursive: true, force: true });
mkdirSync(extractDir, { recursive: true });
// tar sait lire .zip et .tgz, sous Windows 10+ (bsdtar) comme sous Linux.
execFileSync("tar", ["-xf", archive, "-C", extractDir, ort.inner]);
place(join(extractDir, ort.inner), ort.dest);
