//! Module Figures (ex-Figurine), côté natif — détourage local (docs/figurine/SPEC.md §8) : ONNX Runtime + modèle IS-Net embarqués, aucun réseau.
//!
//! - [`pipeline`] : pré- et post-traitement (pur, testé sur images synthétiques) ;
//! - [`model`] : chargement de la DLL ONNX Runtime et du modèle, inférence ;
//! - [`dib`] : conversions DIB (format bitmap du presse-papier Windows) ↔ RGBA ;
//! - [`clipboard`] : lecture/écriture du presse-papier Windows (PNG, DIB, HTML).
//!
//! Le seuil, le pinceau et le lissage des bords sont appliqués côté TypeScript
//! (`modules/figures/core/cutout/`), à partir du masque « doux » renvoyé ici.

pub mod clipboard;
pub mod commands;
pub mod dib;
pub mod model;
pub mod pipeline;
