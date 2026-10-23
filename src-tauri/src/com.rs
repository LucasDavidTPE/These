//! Pilotage d'Office par COM (liaison tardive, `IDispatch`), directement depuis l'application : pas de
//! script PowerShell, donc indifférent aux postes verrouillés (mode de langage restreint). Partagé par
//! Word (`.doc` → `.docx`) et Excel (aspect des graphiques). Windows seulement.

use std::mem::ManuallyDrop;
use windows::core::{BSTR, GUID, HSTRING, PCWSTR};
use windows::Win32::Foundation::{VARIANT_FALSE, VARIANT_TRUE};
use windows::Win32::System::Com::{
    CLSIDFromProgID, CoCreateInstance, CoInitializeEx, CoUninitialize, IDispatch,
    CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED, DISPATCH_FLAGS, DISPATCH_METHOD,
    DISPATCH_PROPERTYGET, DISPATCH_PROPERTYPUT, DISPPARAMS, EXCEPINFO,
};
use windows::Win32::System::Ole::DISPID_PROPERTYPUT;
use windows::Win32::System::Variant::{
    VariantClear, VARIANT, VT_BOOL, VT_BSTR, VT_DISPATCH, VT_I2, VT_I4,
};

/// Noms des méthodes et propriétés en anglais (bibliothèques de types d'Office).
const LCID_EN: u32 = 0x0409;
/// Erreur renvoyée quand l'application Office n'est pas installée.
pub const ABSENT: &str = "OFFICE_ABSENT";

pub enum Arg<'a> {
    Texte(&'a str),
    Entier(i32),
    Bool(bool),
}

fn variant(a: &Arg) -> VARIANT {
    let mut v = VARIANT::default();
    // SAFETY : union VARIANT remplie selon son étiquette `vt`.
    unsafe {
        let x = &mut *v.Anonymous.Anonymous;
        match a {
            Arg::Texte(t) => {
                x.vt = VT_BSTR;
                x.Anonymous.bstrVal = ManuallyDrop::new(BSTR::from(*t));
            }
            Arg::Entier(n) => {
                x.vt = VT_I4;
                x.Anonymous.lVal = *n;
            }
            Arg::Bool(b) => {
                x.vt = VT_BOOL;
                x.Anonymous.boolVal = if *b { VARIANT_TRUE } else { VARIANT_FALSE };
            }
        }
    }
    v
}

/// Résultat d'un appel : un objet, un entier ou un texte (le reste est ignoré).
pub struct Retour {
    pub objet: Option<IDispatch>,
    pub entier: Option<i32>,
    pub texte: Option<String>,
}

pub fn appeler(
    obj: &IDispatch,
    nom: &str,
    genre: DISPATCH_FLAGS,
    args: &[Arg],
) -> Result<Retour, String> {
    let large = HSTRING::from(nom);
    let mut id = 0i32;
    // SAFETY : un nom, un identifiant en sortie.
    unsafe {
        obj.GetIDsOfNames(
            &GUID::zeroed(),
            &PCWSTR(large.as_ptr()),
            1,
            LCID_EN,
            &mut id,
        )
    }
    .map_err(|e| format!("{nom} : {}", e.message()))?;
    // arguments dans l'ordre inverse (convention IDispatch)
    let mut vargs: Vec<VARIANT> = args.iter().rev().map(variant).collect();
    let mut id_put = DISPID_PROPERTYPUT;
    let put = genre == DISPATCH_PROPERTYPUT;
    let params = DISPPARAMS {
        rgvarg: if vargs.is_empty() {
            std::ptr::null_mut()
        } else {
            vargs.as_mut_ptr()
        },
        rgdispidNamedArgs: if put {
            &mut id_put
        } else {
            std::ptr::null_mut()
        },
        cArgs: vargs.len() as u32,
        cNamedArgs: u32::from(put),
    };
    let mut res = VARIANT::default();
    let mut exc = EXCEPINFO::default();
    // SAFETY : paramètres valides pendant l'appel, libérés ensuite.
    let r = unsafe {
        obj.Invoke(
            id,
            &GUID::zeroed(),
            LCID_EN,
            genre,
            &params,
            Some(&mut res),
            Some(&mut exc),
            None,
        )
    };
    for v in vargs.iter_mut() {
        // SAFETY : variantes créées ci-dessus.
        let _ = unsafe { VariantClear(v) };
    }
    // SAFETY : chaînes de l'exception remplies (ou vides) par Invoke ; libérées une fois.
    let detail = unsafe {
        let d = exc.bstrDescription.to_string();
        ManuallyDrop::drop(&mut exc.bstrDescription);
        ManuallyDrop::drop(&mut exc.bstrSource);
        ManuallyDrop::drop(&mut exc.bstrHelpFile);
        d
    };
    if let Err(e) = r {
        let _ = unsafe { VariantClear(&mut res) };
        return Err(if detail.trim().is_empty() {
            format!("{nom} : {}", e.message())
        } else {
            detail.trim().to_string()
        });
    }
    // SAFETY : lecture selon l'étiquette, puis libération.
    let sortie = unsafe {
        let x = &*res.Anonymous.Anonymous;
        let objet = if x.vt == VT_DISPATCH {
            (*x.Anonymous.pdispVal).clone()
        } else {
            None
        };
        let entier = if x.vt == VT_I4 {
            Some(x.Anonymous.lVal)
        } else if x.vt == VT_I2 {
            Some(i32::from(x.Anonymous.iVal))
        } else {
            None
        };
        let texte = if x.vt == VT_BSTR {
            Some(x.Anonymous.bstrVal.to_string())
        } else {
            None
        };
        Retour {
            objet,
            entier,
            texte,
        }
    };
    let _ = unsafe { VariantClear(&mut res) };
    Ok(sortie)
}

/// Propriété ou méthode qui doit renvoyer un objet.
pub fn objet(r: Result<Retour, String>, quoi: &str) -> Result<IDispatch, String> {
    r?.objet.ok_or_else(|| format!("{quoi} : rien de renvoyé."))
}

pub fn lire(obj: &IDispatch, nom: &str) -> Result<IDispatch, String> {
    objet(appeler(obj, nom, DISPATCH_PROPERTYGET, &[]), nom)
}

pub fn entier(obj: &IDispatch, nom: &str) -> Option<i32> {
    appeler(obj, nom, DISPATCH_PROPERTYGET, &[])
        .ok()
        .and_then(|r| r.entier)
}

pub fn texte(obj: &IDispatch, nom: &str) -> Option<String> {
    appeler(obj, nom, DISPATCH_PROPERTYGET, &[])
        .ok()
        .and_then(|r| r.texte)
}

/// Élément n° `i` (à partir de 1) d'une collection Office.
pub fn element(collection: &IDispatch, i: i32) -> Result<IDispatch, String> {
    objet(
        appeler(collection, "Item", DISPATCH_METHOD | DISPATCH_PROPERTYGET, &[Arg::Entier(i)]),
        "Item",
    )
}

pub fn ecrire(obj: &IDispatch, nom: &str, valeur: Arg) -> Result<(), String> {
    appeler(obj, nom, DISPATCH_PROPERTYPUT, &[valeur]).map(|_| ())
}

pub fn methode(obj: &IDispatch, nom: &str, args: &[Arg]) -> Result<Retour, String> {
    appeler(obj, nom, DISPATCH_METHOD, args)
}

/// Démarre (ou rejoint) une application Office par son identifiant (« Word.Application »).
pub fn application(progid: &str) -> Result<IDispatch, String> {
    let id = HSTRING::from(progid);
    // SAFETY : identifiant de programme valide pendant l'appel.
    let clsid = unsafe { CLSIDFromProgID(PCWSTR(id.as_ptr())) }.map_err(|_| ABSENT.to_string())?;
    // SAFETY : serveur COM local (WINWORD.EXE, EXCEL.EXE).
    unsafe { CoCreateInstance(&clsid, None, CLSCTX_LOCAL_SERVER) }
        .map_err(|e| format!("{progid} ne démarre pas : {}", e.message()))
}

/// Exécute `f` dans le fil appelant avec COM initialisé (puis libéré).
pub fn avec_com<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    // SAFETY : COM initialisé puis libéré dans ce même fil, objets relâchés avant.
    let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if init.is_err() {
        return Err(format!("COM indisponible : {}", init.message()));
    }
    let r = f();
    unsafe { CoUninitialize() };
    r
}
