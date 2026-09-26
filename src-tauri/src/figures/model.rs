//! Inférence : ONNX Runtime (DLL embarquée, chargée à la demande) + modèle IS-Net.

use super::pipeline::{postprocess, preprocess, ModelSpec, ISNET_GENERAL};
use image::{GrayImage, RgbaImage};
use ort::session::Session;
use ort::value::Tensor;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

/// Emplacements relatifs au dossier des ressources de l'appli (voir scripts/fetch-models.mjs).
pub const MODEL_RESOURCE: &str = "resources/models/isnet-general-use.onnx";
#[cfg(windows)]
pub const ORT_RESOURCE: &str = "resources/onnxruntime/onnxruntime.dll";
#[cfg(not(windows))]
pub const ORT_RESOURCE: &str = "resources/onnxruntime/libonnxruntime.so";

pub struct Engine {
    session: Session,
    spec: ModelSpec,
}

/// ONNX Runtime ne peut être initialisé qu'une fois par processus.
static ORT_INIT: OnceLock<Result<(), String>> = OnceLock::new();

fn init_runtime(lib: &Path) -> Result<(), String> {
    ORT_INIT
        .get_or_init(|| {
            if !lib.is_file() {
                return Err(format!(
                    "ONNX Runtime introuvable ({}). En développement : npm run fetch-models.",
                    lib.display()
                ));
            }
            ort::init_from(lib)
                .map_err(|e| format!("Impossible de charger ONNX Runtime : {e}"))?
                .with_name("figurine")
                .commit();
            Ok(())
        })
        .clone()
}

impl Engine {
    pub fn load(ort_lib: &Path, model: &Path) -> Result<Self, String> {
        init_runtime(ort_lib)?;
        if !model.is_file() {
            return Err(format!(
                "Modèle de détourage introuvable ({}). En développement : npm run fetch-models.",
                model.display()
            ));
        }
        let session = Session::builder()
            .and_then(|mut b| b.commit_from_file(model))
            .map_err(|e| format!("Chargement du modèle impossible : {e}"))?;
        Ok(Engine {
            session,
            spec: ISNET_GENERAL,
        })
    }

    /// Masque « doux » (0 = fond, 255 = sujet) à la taille de l'image.
    pub fn segment(&mut self, img: &RgbaImage) -> Result<GrayImage, String> {
        let spec = self.spec;
        let s = spec.size as usize;
        let input = preprocess(img, &spec);
        let tensor = Tensor::from_array(([1usize, 3, s, s], input))
            .map_err(|e| format!("Tenseur d'entrée : {e}"))?;
        let outputs = self
            .session
            .run(ort::inputs![tensor])
            .map_err(|e| format!("Inférence : {e}"))?;
        // IS-Net renvoie plusieurs cartes ; la première est la plus fine.
        let (_, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Sortie du modèle : {e}"))?;
        let plane = s * s;
        if data.len() < plane {
            return Err("Sortie du modèle trop petite".into());
        }
        Ok(postprocess(
            &data[..plane],
            spec.size,
            img.width(),
            img.height(),
        ))
    }
}

/// Moteur partagé, chargé au premier détourage (≈ 1 à 2 s), puis réutilisé.
static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);

pub fn segment_with_shared(
    ort_lib: PathBuf,
    model: PathBuf,
    img: &RgbaImage,
) -> Result<(GrayImage, u128), String> {
    let mut guard = ENGINE
        .lock()
        .map_err(|_| "Moteur de détourage indisponible".to_string())?;
    if guard.is_none() {
        *guard = Some(Engine::load(&ort_lib, &model)?);
    }
    let start = Instant::now();
    let mask = guard.as_mut().expect("moteur chargé").segment(img)?;
    Ok((mask, start.elapsed().as_millis()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test de bout en bout avec le vrai modèle, si `npm run fetch-models` a été lancé.
    /// Sans les ressources, le test est ignoré (message affiché) sauf si
    /// THESE_EXIGER_MODELE=1 (CI Windows), auquel cas il échoue.
    #[test]
    fn segments_a_synthetic_object() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"));
        let (lib, model) = (base.join(ORT_RESOURCE), base.join(MODEL_RESOURCE));
        if !lib.is_file() || !model.is_file() {
            assert!(
                std::env::var("THESE_EXIGER_MODELE").is_err(),
                "ressources de détourage absentes"
            );
            eprintln!("détourage : ressources absentes, test ignoré (npm run fetch-models)");
            return;
        }
        // Objet sombre (disque) sur fond blanc, 800 × 600.
        let img = RgbaImage::from_fn(800, 600, |x, y| {
            let (dx, dy) = (x as f32 - 400.0, y as f32 - 300.0);
            if dx * dx + dy * dy < 150.0 * 150.0 {
                image::Rgba([40, 60, 120, 255])
            } else {
                image::Rgba([255, 255, 255, 255])
            }
        });
        let mut engine = Engine::load(&lib, &model).expect("chargement");
        let start = Instant::now();
        let mask = engine.segment(&img).expect("inférence");
        eprintln!("détourage 800×600 : {} ms", start.elapsed().as_millis());
        assert_eq!(mask.dimensions(), (800, 600));
        assert!(mask.get_pixel(400, 300)[0] > 200, "le disque est gardé");
        assert!(mask.get_pixel(10, 10)[0] < 50, "le fond est retiré");
    }
}
