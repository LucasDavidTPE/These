import type { ComponentDef } from "../component";
import { angleDimension, arrow, axes2d, axes3d, brace, dimension, measurePoint, text } from "./annotations";
import { dashpot } from "./dashpot";
import { bezier, circleShape, line, polylineShape } from "./free";
import { layerStack } from "./layerStack";
import { bogie, footprint, force, pressureProfile, uniformLoad, wheelSection } from "./loads";
import { rectangle } from "./rectangle";
import { burgers, generalizedMaxwell, huetSayegh, kelvinVoigt, kvg, link, maxwell, model2s2p1d, node, parabolic, slider, zener } from "./rheoComponents";
import { spring } from "./spring";
import { fixedSupport, ground, simpleSupport } from "./structure";

/** Tous les composants, dans l'ordre de la palette. */
export const COMPONENT_LIST: ComponentDef[] = [
  // Rhéologie
  spring,
  dashpot,
  parabolic,
  slider,
  link,
  node,
  maxwell,
  kelvinVoigt,
  generalizedMaxwell,
  kvg,
  model2s2p1d,
  huetSayegh,
  zener,
  burgers,
  // Structure
  layerStack,
  fixedSupport,
  simpleSupport,
  ground,
  // Chargement
  force,
  uniformLoad,
  pressureProfile,
  footprint,
  wheelSection,
  bogie,
  // Annotations
  axes2d,
  axes3d,
  dimension,
  angleDimension,
  arrow,
  brace,
  text,
  measurePoint,
  // Libres
  line,
  polylineShape,
  rectangle,
  circleShape,
  bezier,
];

/** Registre des composants disponibles, par type. */
export const COMPONENTS: Record<string, ComponentDef> = Object.fromEntries(COMPONENT_LIST.map((c) => [c.type, c]));

export { dashpot, layerStack, rectangle, spring };
