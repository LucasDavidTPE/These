/** « Comment ça marche ? » : le modèle semi-analytique et la méthode spectrale, sans le code. */

const ETAPES = [
  { n: 1, titre: "Charge → ondes", sous: "transformée de Fourier 2D" },
  { n: 2, titre: "Une onde à la fois", sous: "résolution en profondeur" },
  { n: 3, titre: "× spectre de la charge", sous: "champs par onde" },
  { n: 4, titre: "Ondes → chaussée", sous: "FFT + intégrale" },
];

function Schema() {
  return (
    <div className="cs-schema" role="img" aria-label="Les quatre étapes du calcul">
      {ETAPES.map((e, i) => (
        <div key={e.n} className="cs-schema-etape">
          <div className="cs-schema-boite">
            <strong>
              {e.n}. {e.titre}
            </strong>
            <span className="discret petit">{e.sous}</span>
          </div>
          {i < ETAPES.length - 1 ? <span className="cs-schema-fleche">→</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Explication() {
  return (
    <div className="carte cs-explication">
      <p>
        <strong>En une phrase :</strong> on décompose la charge en <em>ondes</em> ; pour <em>une</em> onde, le problème 3D devient un problème 1D en profondeur qui se résout
        exactement (des exponentielles) ; on le fait pour beaucoup d'ondes, puis on recompose. « Semi-analytique » = analytique en profondeur, numérique dans le plan. Pas de
        maillage : c'est ce qui rend le calcul rapide et précis.
      </p>
      <Schema />
      <details>
        <summary>1. Décomposer la charge en ondes</summary>
        <p>
          Une charge de surface (rectangle, cercle, carte de pression, roue avec effort tangentiel…) est remplacée par son spectre : « combien de chaque onde
          exp(i(k₁x + k₂y)) faut-il pour la refaire ». Le nombre d'onde ξ = √(k₁² + k₂²) est l'inverse d'une longueur : grand ξ = détails fins près de la surface, petit ξ =
          grandes longueurs d'onde qui vont chercher loin.
        </p>
      </details>
      <details>
        <summary>2. Résoudre en profondeur, une onde à la fois</summary>
        <p>
          Les couches sont infinies horizontalement : chaque onde évolue seule. Dans une couche, la solution est une combinaison de quatre exponentielles (deux qui
          décroissent en descendant, deux en montant), plus deux pour le mouvement horizontal perpendiculaire à l'onde (utile s'il y a un effort tangentiel). Le massif
          semi-infini n'a que les exponentielles qui décroissent. On écrit ensuite les conditions : charge en surface, continuité aux interfaces collées (cisaillement nul
          si glissantes). Cela donne un petit système linéaire par ξ : c'est le « noyau », qui ne dépend que de la structure et des modules, pas de la charge.
        </p>
      </details>
      <details>
        <summary>3. Le matériau et le régime : statique, harmonique, roulant</summary>
        <p>
          Un matériau viscoélastique (2S2P1D…) se traite avec un module complexe E*(ω) : même calcul qu'en élasticité. Reste à savoir quelle pulsation ω voit chaque onde :
        </p>
        <ul>
          <li>
            <strong>Statique</strong> : ω = 0 (charge posée, temps long).
          </li>
          <li>
            <strong>Harmonique</strong> : ω = 2πf pour toutes les ondes (charge qui pulse, comme le HWD) ; les résultats sont des amplitudes complexes.
          </li>
          <li>
            <strong>Roulant</strong> : ω = −k₁·V. Une onde de longueur λ défile devant un point en un temps λ/V : la roue rapide sollicite le bitume à haute fréquence
            (plus raide), la lente à basse fréquence (plus mou). Chaque onde a donc son propre module.
          </li>
        </ul>
        <p>Le calcul est quasi-stationnaire : l'inertie est négligée, aux vitesses de circulation c'est très raisonnable.</p>
      </details>
      <details>
        <summary>4. Revenir dans l'espace : FFT et partition de l'unité</summary>
        <p>
          Pour sommer les ondes on utilise une FFT, qui suppose un domaine périodique de taille L : elle répète la charge tous les L mètres. Les ondes courtes n'en
          souffrent pas, mais les ondes longues (petits k) voient des charges voisines fictives, et le noyau y varie très vite. Remède : on scinde le spectre en (1 − φ)·F + φ·F,
          avec φ une gaussienne qui vaut 1 près de k = 0. Les ondes courtes passent par la FFT ; les ondes longues sont intégrées en continu, avec des points très serrés
          près de 0 : plus de périodicité, la flèche absolue est juste.
        </p>
      </details>
      <details>
        <summary>5. Ce que le modèle ne fait pas</summary>
        <ul>
          <li>Couches horizontales, infinies, homogènes et isotropes : pas de fissure, de bord, ni de gradient de température dans une couche.</li>
          <li>Comportement linéaire : pas de plasticité, donc pas d'orniérage.</li>
          <li>Pas d'inertie ni d'ondes qui se propagent dans le sol.</li>
          <li>Effort tangentiel avec une interface glissante : problème mal posé, le calcul est refusé.</li>
        </ul>
        <p>
          Fiabilité : le calcul est comparé au code Python d'origine à 1e-9 près (noyau, lois, grilles, cas de révolution). Notice complète : <code>docs/CHAUSSSPEC_EXPLIQUE.md</code>.
        </p>
      </details>
    </div>
  );
}
