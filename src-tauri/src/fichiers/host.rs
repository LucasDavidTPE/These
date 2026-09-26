//! Nom du poste, écrit dans les verrous et dans `meta.json` (`last_host`).

/// Nom du poste : `COMPUTERNAME` sous Windows, sinon `HOSTNAME` ou `/etc/hostname`.
pub fn host_name() -> String {
    let from_env = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
    from_env("COMPUTERNAME")
        .or_else(|| from_env("HOSTNAME"))
        .or_else(|| {
            std::fs::read_to_string("/etc/hostname")
                .ok()
                .filter(|v| !v.trim().is_empty())
        })
        .map(|v| v.trim().to_string())
        .unwrap_or_else(|| "POSTE-INCONNU".to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn is_never_empty() {
        let h = super::host_name();
        assert!(!h.is_empty());
        assert_eq!(h, h.trim());
    }
}
