//! Pré- et post-traitement du modèle de détourage, identiques à ceux de rembg
//! (référence de fait pour ces modèles convertis en ONNX).

use image::imageops::{self, FilterType};
use image::{GrayImage, RgbImage, RgbaImage};

/// Caractéristiques d'entrée d'un modèle de segmentation.
#[derive(Debug, Clone, Copy)]
pub struct ModelSpec {
    /// Côté de l'image carrée attendue en entrée.
    pub size: u32,
    pub mean: [f32; 3],
    pub std: [f32; 3],
}

/// IS-Net « general use » (DIS), entrée 1024 × 1024.
pub const ISNET_GENERAL: ModelSpec = ModelSpec {
    size: 1024,
    mean: [0.485, 0.456, 0.406],
    std: [1.0, 1.0, 1.0],
};

/// Image → tenseur NCHW `[1, 3, size, size]` : redimensionnement (Lanczos, sans garder les
/// proportions), division par le maximum de l'image, puis (x − moyenne) / écart-type.
/// La transparence éventuelle de l'image d'entrée est ignorée ici.
pub fn preprocess(img: &RgbaImage, spec: &ModelSpec) -> Vec<f32> {
    let rgb: RgbImage = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
    let resized = imageops::resize(&rgb, spec.size, spec.size, FilterType::Lanczos3);
    let max = resized.as_raw().iter().copied().max().unwrap_or(0).max(1) as f32;
    let plane = (spec.size * spec.size) as usize;
    let mut out = vec![0f32; 3 * plane];
    for (i, px) in resized.pixels().enumerate() {
        for c in 0..3 {
            out[c * plane + i] = (px[c] as f32 / max - spec.mean[c]) / spec.std[c];
        }
    }
    out
}

/// Sortie du modèle (carte `size × size`) → masque 8 bits à la taille d'origine :
/// normalisation min-max puis redimensionnement (Lanczos).
pub fn postprocess(pred: &[f32], size: u32, width: u32, height: u32) -> GrayImage {
    assert_eq!(
        pred.len(),
        (size * size) as usize,
        "taille de sortie inattendue"
    );
    let (mut lo, mut hi) = (f32::INFINITY, f32::NEG_INFINITY);
    for &v in pred {
        lo = lo.min(v);
        hi = hi.max(v);
    }
    let range = if hi - lo > 1e-12 { hi - lo } else { 1.0 };
    let small = GrayImage::from_fn(size, size, |x, y| {
        let v = (pred[(y * size + x) as usize] - lo) / range;
        image::Luma([(v * 255.0).round().clamp(0.0, 255.0) as u8])
    });
    if size == width && size == height {
        return small;
    }
    imageops::resize(&small, width, height, FilterType::Lanczos3)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SMALL: ModelSpec = ModelSpec {
        size: 8,
        mean: [0.485, 0.456, 0.406],
        std: [1.0, 1.0, 1.0],
    };

    #[test]
    fn preprocess_layout_and_normalization() {
        // Image uniforme rouge (200, 0, 0) : max = 200 → R = 1 − 0,485, G = −0,456, B = −0,406.
        let img = RgbaImage::from_pixel(5, 3, image::Rgba([200, 0, 0, 255]));
        let t = preprocess(&img, &SMALL);
        assert_eq!(t.len(), 3 * 64);
        let plane = 64;
        assert!((t[0] - 0.515).abs() < 1e-3);
        assert!((t[plane] + 0.456).abs() < 1e-3);
        assert!((t[2 * plane + 63] + 0.406).abs() < 1e-3);
    }

    #[test]
    fn preprocess_ignores_alpha_and_handles_black() {
        let img = RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 0, 0]));
        let t = preprocess(&img, &SMALL);
        assert!(t.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn preprocess_keeps_spatial_layout() {
        // Moitié gauche blanche, moitié droite noire : le tenseur doit suivre.
        let img = RgbaImage::from_fn(16, 16, |x, _| {
            if x < 8 {
                image::Rgba([255, 255, 255, 255])
            } else {
                image::Rgba([0, 0, 0, 255])
            }
        });
        let t = preprocess(&img, &SMALL);
        assert!(t[8] > 0.4); // ligne 1, colonne 0 (blanc)
        assert!(t[15] < -0.4); // ligne 1, colonne 7 (noir)
    }

    #[test]
    fn postprocess_normalizes_and_resizes() {
        // Prédiction : disque au centre (valeurs 2.0) sur fond −1.0.
        let size = 8u32;
        let pred: Vec<f32> = (0..size * size)
            .map(|i| {
                let (x, y) = ((i % size) as f32 - 3.5, (i / size) as f32 - 3.5);
                if x * x + y * y < 6.0 {
                    2.0
                } else {
                    -1.0
                }
            })
            .collect();
        let mask = postprocess(&pred, size, 40, 20);
        assert_eq!(mask.dimensions(), (40, 20));
        // Lanczos ondule légèrement près des bords du disque (≈ 233 au centre).
        assert!(mask.get_pixel(20, 10)[0] > 220, "centre opaque");
        assert!(mask.get_pixel(0, 0)[0] < 15, "coin transparent");
    }

    #[test]
    fn postprocess_constant_prediction_does_not_divide_by_zero() {
        let mask = postprocess(&[0.3; 16], 4, 4, 4);
        assert!(mask.pixels().all(|p| p[0] == 0));
    }
}
