//! Format DIB du presse-papier Windows (`CF_DIB` / `CF_DIBV5`) : en-tête BITMAPINFOHEADER
//! (ou V4/V5) suivi des pixels, sans l'en-tête de fichier BMP. Code pur, testé sous Linux.

use image::RgbaImage;

const BI_RGB: u32 = 0;
const BI_BITFIELDS: u32 = 3;

fn u16_at(b: &[u8], o: usize) -> Option<u16> {
    b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]]))
}
fn u32_at(b: &[u8], o: usize) -> Option<u32> {
    b.get(o..o + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}
fn i32_at(b: &[u8], o: usize) -> Option<i32> {
    u32_at(b, o).map(|v| v as i32)
}

/// Décode un DIB 24 ou 32 bits (BI_RGB ou BI_BITFIELDS), de haut en bas ou de bas en haut.
/// En 32 bits BI_RGB, le canal alpha n'est pris en compte que s'il n'est pas uniformément
/// nul (beaucoup d'applications le laissent à 0).
pub fn dib_to_rgba(b: &[u8]) -> Result<RgbaImage, String> {
    let bad = |m: &str| format!("Image du presse-papier illisible : {m}");
    let header = u32_at(b, 0).ok_or_else(|| bad("en-tête tronqué"))? as usize;
    if header < 40 {
        return Err(bad("en-tête inconnu"));
    }
    let width = i32_at(b, 4).ok_or_else(|| bad("largeur"))?;
    let height = i32_at(b, 8).ok_or_else(|| bad("hauteur"))?;
    let bpp = u16_at(b, 14).ok_or_else(|| bad("profondeur"))?;
    let compression = u32_at(b, 16).ok_or_else(|| bad("compression"))?;
    let colors_used = u32_at(b, 32).unwrap_or(0) as usize;
    if width <= 0 || height == 0 || width > 30_000 || height.abs() > 30_000 {
        return Err(bad("dimensions"));
    }
    let (w, h) = (width as u32, height.unsigned_abs());
    let top_down = height < 0;

    // Masques de couleur : dans l'en-tête V4/V5, ou juste après un en-tête de 40 octets.
    let mut masks = [0x00ff_0000u32, 0x0000_ff00, 0x0000_00ff, 0xff00_0000];
    let mut pixel_offset = header;
    if compression == BI_BITFIELDS {
        let at = if header >= 52 { 40 } else { header };
        for (i, m) in masks.iter_mut().take(3).enumerate() {
            *m = u32_at(b, at + 4 * i).ok_or_else(|| bad("masques"))?;
        }
        masks[3] = if header >= 56 {
            u32_at(b, 52).unwrap_or(0)
        } else {
            0
        };
        if header == 40 {
            pixel_offset += 12;
        }
    } else if compression != BI_RGB {
        return Err(bad("compression non gérée"));
    }
    pixel_offset += colors_used * 4;

    let bytes_pp = match bpp {
        24 => 3,
        32 => 4,
        _ => return Err(bad("seuls les DIB 24 et 32 bits sont gérés")),
    };
    let stride = ((w as usize * bytes_pp) + 3) & !3;
    let needed = pixel_offset + stride * h as usize;
    if b.len() < needed {
        return Err(bad("données tronquées"));
    }

    let channel = |px: u32, mask: u32| -> u8 {
        if mask == 0 {
            return 255;
        }
        let shift = mask.trailing_zeros();
        let bits = (mask >> shift).count_ones();
        let v = (px & mask) >> shift;
        if bits >= 8 {
            (v >> (bits - 8)) as u8
        } else {
            ((v * 255) / ((1 << bits) - 1)) as u8
        }
    };

    let mut img = RgbaImage::new(w, h);
    let mut any_alpha = false;
    for row in 0..h {
        let src_row = if top_down { row } else { h - 1 - row };
        let start = pixel_offset + src_row as usize * stride;
        for x in 0..w {
            let o = start + x as usize * bytes_pp;
            let rgba = if bytes_pp == 3 {
                [b[o + 2], b[o + 1], b[o], 255]
            } else {
                let px = u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]);
                let a = channel(px, masks[3]);
                any_alpha |= a != 0;
                [
                    channel(px, masks[0]),
                    channel(px, masks[1]),
                    channel(px, masks[2]),
                    a,
                ]
            };
            img.put_pixel(x, row, image::Rgba(rgba));
        }
    }
    if bytes_pp == 4 && !any_alpha {
        for p in img.pixels_mut() {
            p[3] = 255;
        }
    }
    Ok(img)
}

/// Encode en DIB 32 bits BI_RGB, de bas en haut, **aplati sur fond blanc** : les
/// applications qui lisent le DIB ignorent souvent l'alpha ; celles qui gèrent la
/// transparence (Word, PowerPoint) lisent le format « PNG » posé à côté.
pub fn rgba_to_dib(img: &RgbaImage) -> Vec<u8> {
    let (w, h) = img.dimensions();
    let stride = w as usize * 4;
    let mut out = Vec::with_capacity(40 + stride * h as usize);
    out.extend_from_slice(&40u32.to_le_bytes());
    out.extend_from_slice(&(w as i32).to_le_bytes());
    out.extend_from_slice(&(h as i32).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&BI_RGB.to_le_bytes());
    out.extend_from_slice(&((stride * h as usize) as u32).to_le_bytes());
    out.extend_from_slice(&2835i32.to_le_bytes()); // 72 dpi
    out.extend_from_slice(&2835i32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    for row in (0..h).rev() {
        for x in 0..w {
            let p = img.get_pixel(x, row);
            let a = p[3] as u32;
            let over_white = |c: u8| ((c as u32 * a + 255 * (255 - a) + 127) / 255) as u8;
            out.extend_from_slice(&[over_white(p[2]), over_white(p[1]), over_white(p[0]), 255]);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> RgbaImage {
        RgbaImage::from_fn(3, 2, |x, y| {
            image::Rgba([(x * 80) as u8, (y * 100) as u8, 7, 255])
        })
    }

    #[test]
    fn round_trip_opaque_image() {
        let img = sample();
        let dib = rgba_to_dib(&img);
        assert_eq!(dib.len(), 40 + 3 * 4 * 2);
        assert_eq!(dib_to_rgba(&dib).unwrap(), img);
    }

    #[test]
    fn written_dib_is_flattened_on_white() {
        let img = RgbaImage::from_pixel(1, 1, image::Rgba([0, 0, 0, 0]));
        let back = dib_to_rgba(&rgba_to_dib(&img)).unwrap();
        assert_eq!(back.get_pixel(0, 0).0, [255, 255, 255, 255]);
        let half = RgbaImage::from_pixel(1, 1, image::Rgba([0, 0, 0, 128]));
        let back = dib_to_rgba(&rgba_to_dib(&half)).unwrap();
        assert_eq!(back.get_pixel(0, 0).0, [127, 127, 127, 255]);
    }

    fn header(w: i32, h: i32, bpp: u16, compression: u32, size: u32) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend_from_slice(&size.to_le_bytes());
        v.extend_from_slice(&w.to_le_bytes());
        v.extend_from_slice(&h.to_le_bytes());
        v.extend_from_slice(&1u16.to_le_bytes());
        v.extend_from_slice(&bpp.to_le_bytes());
        v.extend_from_slice(&compression.to_le_bytes());
        v.resize(size as usize, 0);
        v
    }

    #[test]
    fn reads_24bit_bottom_up_with_row_padding() {
        // 1 × 2 pixels, lignes de 3 octets complétées à 4. Bas : bleu ; haut : rouge.
        let mut b = header(1, 2, 24, BI_RGB, 40);
        b.extend_from_slice(&[255, 0, 0, 0]); // ligne du bas (BGR)
        b.extend_from_slice(&[0, 0, 255, 0]); // ligne du haut
        let img = dib_to_rgba(&b).unwrap();
        assert_eq!(img.get_pixel(0, 0).0, [255, 0, 0, 255]);
        assert_eq!(img.get_pixel(0, 1).0, [0, 0, 255, 255]);
    }

    #[test]
    fn reads_top_down_32bit_with_zero_alpha_as_opaque() {
        let mut b = header(2, -1, 32, BI_RGB, 40);
        b.extend_from_slice(&[1, 2, 3, 0, 4, 5, 6, 0]);
        let img = dib_to_rgba(&b).unwrap();
        assert_eq!(img.get_pixel(0, 0).0, [3, 2, 1, 255]);
        assert_eq!(img.get_pixel(1, 0).0, [6, 5, 4, 255]);
    }

    #[test]
    fn reads_v5_bitfields_with_alpha() {
        // En-tête V5 (124 octets), masques BGRA standards, un pixel semi-transparent.
        let mut b = header(1, 1, 32, BI_BITFIELDS, 124);
        b[40..44].copy_from_slice(&0x00ff_0000u32.to_le_bytes());
        b[44..48].copy_from_slice(&0x0000_ff00u32.to_le_bytes());
        b[48..52].copy_from_slice(&0x0000_00ffu32.to_le_bytes());
        b[52..56].copy_from_slice(&0xff00_0000u32.to_le_bytes());
        b.extend_from_slice(&[10, 20, 30, 128]);
        assert_eq!(
            dib_to_rgba(&b).unwrap().get_pixel(0, 0).0,
            [30, 20, 10, 128]
        );
    }

    #[test]
    fn reads_40_byte_header_followed_by_bitfield_masks() {
        let mut b = header(1, 1, 32, BI_BITFIELDS, 40);
        for m in [0x00ff_0000u32, 0x0000_ff00, 0x0000_00ff] {
            b.extend_from_slice(&m.to_le_bytes());
        }
        b.extend_from_slice(&[10, 20, 30, 0]);
        assert_eq!(
            dib_to_rgba(&b).unwrap().get_pixel(0, 0).0,
            [30, 20, 10, 255]
        );
    }

    #[test]
    fn rejects_garbage() {
        assert!(dib_to_rgba(&[]).is_err());
        assert!(dib_to_rgba(&[1, 2, 3, 4, 5]).is_err());
        assert!(dib_to_rgba(&header(1, 1, 8, BI_RGB, 40)).is_err());
        assert!(dib_to_rgba(&header(4, 4, 32, BI_RGB, 40)).is_err()); // tronqué
    }
}
