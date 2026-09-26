import { describe, expect, it } from "vitest";
import { AlreadyExistsError, LibraryError, LockedError, NotFoundError, libraryErrorFromIpc } from "./fs";

describe("libraryErrorFromIpc", () => {
  it("reconnaît les codes renvoyés par Rust", () => {
    expect(libraryErrorFromIpc({ code: "already-exists", message: "Existe déjà : a" }, "a")).toBeInstanceOf(
      AlreadyExistsError,
    );
    expect(libraryErrorFromIpc({ code: "not-found", message: "Introuvable : a" })).toBeInstanceOf(NotFoundError);
    const locked = libraryErrorFromIpc({ code: "locked", message: "Figure en cours d'édition sur PC-MAISON" });
    expect(locked).toBeInstanceOf(LockedError);
    expect(locked.message).toContain("PC-MAISON");
  });

  it("garde le code des autres erreurs", () => {
    const e = libraryErrorFromIpc({ code: "invalid-path", message: "Chemin relatif invalide" });
    expect(e).toBeInstanceOf(LibraryError);
    expect((e as LibraryError).code).toBe("invalid-path");
  });

  it("gère une erreur sans forme attendue", () => {
    expect((libraryErrorFromIpc("boum") as LibraryError).code).toBe("unknown");
    expect(libraryErrorFromIpc(new Error("x")).message).toBe("x");
  });
});
