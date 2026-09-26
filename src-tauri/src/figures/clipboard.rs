//! Presse-papier Windows (SPEC §8) :
//! - lecture d'une image : format « PNG » (garde la transparence) sinon DIB ;
//! - lecture du format « HTML Format » (pour retrouver `SourceURL:` et `<img src>`) ;
//! - écriture d'une image : « PNG » **et** DIB, pour Word / PowerPoint et les autres.
//!
//! Hors Windows, ces fonctions renvoient une erreur explicite.

use image::RgbaImage;

/// Image PNG encodée depuis des pixels RGBA.
pub fn encode_png(img: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| format!("Encodage PNG : {e}"))?;
    Ok(out.into_inner())
}

#[cfg(windows)]
mod imp {
    use super::super::dib::{dib_to_rgba, rgba_to_dib};
    use super::encode_png;
    use clipboard_win::{formats, raw, register_format, Clipboard};

    fn open() -> Result<Clipboard, String> {
        Clipboard::new_attempts(10).map_err(|e| format!("Presse-papier occupé : {e}"))
    }

    fn get(format: u32) -> Option<Vec<u8>> {
        if !raw::is_format_avail(format) {
            return None;
        }
        let mut buf = Vec::new();
        raw::get_vec(format, &mut buf).ok().map(|_| buf)
    }

    /// PNG de l'image du presse-papier, ou None s'il n'y en a pas.
    pub fn read_image_png() -> Result<Option<Vec<u8>>, String> {
        let _clip = open()?;
        if let Some(png) = register_format("PNG").and_then(|f| get(f.get())) {
            if image::load_from_memory_with_format(&png, image::ImageFormat::Png).is_ok() {
                return Ok(Some(png));
            }
        }
        for format in [formats::CF_DIBV5, formats::CF_DIB] {
            if let Some(dib) = get(format) {
                let img = dib_to_rgba(&dib)?;
                return encode_png(&img).map(Some);
            }
        }
        Ok(None)
    }

    pub fn read_html() -> Result<Option<String>, String> {
        let _clip = open()?;
        Ok(register_format("HTML Format")
            .and_then(|f| get(f.get()))
            .map(|b| {
                String::from_utf8_lossy(&b)
                    .trim_end_matches('\0')
                    .to_string()
            }))
    }

    pub fn write_image(img: &image::RgbaImage) -> Result<(), String> {
        write_image_with(img, None)
    }

    /// Image + SVG : formats « PNG », DIB, « image/svg+xml » (Word, Inkscape) et texte.
    pub fn write_image_with(img: &image::RgbaImage, svg: Option<&str>) -> Result<(), String> {
        let png = encode_png(img)?;
        let dib = rgba_to_dib(img);
        let _clip = open()?;
        raw::empty().map_err(|e| format!("Presse-papier : {e}"))?;
        if let Some(svg) = svg {
            let f = register_format("image/svg+xml").ok_or("Format SVG non enregistrable")?;
            raw::set_without_clear(f.get(), svg.as_bytes())
                .map_err(|e| format!("Presse-papier (SVG) : {e}"))?;
            raw::set_string_with(svg, clipboard_win::options::NoClear)
                .map_err(|e| format!("Presse-papier (texte) : {e}"))?;
        }
        let png_format = register_format("PNG").ok_or("Format PNG non enregistrable")?;
        raw::set_without_clear(png_format.get(), &png)
            .map_err(|e| format!("Presse-papier (PNG) : {e}"))?;
        raw::set_without_clear(formats::CF_DIB, &dib)
            .map_err(|e| format!("Presse-papier (DIB) : {e}"))?;
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    const MSG: &str = "Presse-papier d'images : disponible seulement sous Windows.";
    pub fn read_image_png() -> Result<Option<Vec<u8>>, String> {
        Err(MSG.into())
    }
    pub fn read_html() -> Result<Option<String>, String> {
        Err(MSG.into())
    }
    pub fn write_image(_img: &image::RgbaImage) -> Result<(), String> {
        Err(MSG.into())
    }
    pub fn write_image_with(_img: &image::RgbaImage, _svg: Option<&str>) -> Result<(), String> {
        Err(MSG.into())
    }
}

pub use imp::{read_html, read_image_png, write_image, write_image_with};

#[cfg(test)]
mod tests {
    #[test]
    fn png_round_trip_keeps_alpha() {
        let img = image::RgbaImage::from_pixel(2, 2, image::Rgba([1, 2, 3, 4]));
        let png = super::encode_png(&img).unwrap();
        let back = image::load_from_memory(&png).unwrap().to_rgba8();
        assert_eq!(back, img);
    }
}
