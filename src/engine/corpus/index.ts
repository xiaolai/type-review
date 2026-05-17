export { analyzeText, makePassage } from "./analyze";
export { DIFFICULT_WORDS } from "./difficult-words";
export type { PlainWordsOptions } from "./plain-words";
export { COMMON_WORDS, generatePlainWords } from "./plain-words";
export type { PseudoWordOptions } from "./pseudo-words";
export { generatePseudoWords } from "./pseudo-words";
export type {
  CorpusAttribution,
  CorpusEntry,
  CorpusSource,
  CorpusSourceContext,
  SourceKind,
} from "./sources";
export {
  alphabetOf,
  fitsAlphabet,
  lengthScore,
  makeEntry,
  pickWeightedByLength,
} from "./sources";
export type { Filter, Passage } from "./types";
