import type { Card, PageSpec, Example } from "./domain";
import { DomainError } from "./domain";
type Fixture = {
  word: string;
  source: string;
  senses: {
    pos: string;
    original: string;
    en: [string, string];
    de: [string, string];
    fr: [string, string];
  }[];
  alternatives?: { language: string; previews: Record<string, string> }[];
};
export const fixtures: Fixture[] = [
  {
    word: "bank",
    source: "en",
    senses: [
      {
        pos: "noun",
        original: "She deposited her savings at the bank.",
        en: [
          "An institution that holds money and provides financial services.",
          "She deposited her savings at the bank.",
        ],
        de: [
          "Ein Geldinstitut, das Einlagen verwaltet und Finanzdienstleistungen anbietet.",
          "Sie zahlte ihre Ersparnisse bei der Bank ein.",
        ],
        fr: [
          "Un établissement qui conserve de l’argent et propose des services financiers.",
          "Elle a déposé ses économies à la banque.",
        ],
      },
      {
        pos: "noun",
        original: "We sat on the bank and watched the river.",
        en: [
          "The land along the edge of a river or lake.",
          "We sat on the bank and watched the river.",
        ],
        de: [
          "Der Landstreifen am Rand eines Flusses oder Sees; das Ufer.",
          "Wir saßen am Ufer und beobachteten den Fluss.",
        ],
        fr: [
          "Le terrain qui borde une rivière ou un lac ; la rive.",
          "Nous étions assis sur la rive à regarder la rivière.",
        ],
      },
      {
        pos: "verb",
        original: "The pilot banked the aircraft to the left.",
        en: [
          "To tilt sideways while turning, especially an aircraft.",
          "The pilot banked the aircraft to the left.",
        ],
        de: [
          "Sich beim Wenden seitlich neigen, besonders bei einem Flugzeug.",
          "Der Pilot neigte das Flugzeug für die Linkskurve zur Seite.",
        ],
        fr: [
          "S’incliner sur le côté en tournant, notamment pour un avion.",
          "Le pilote a incliné l’avion pour virer à gauche.",
        ],
      },
    ],
  },
  {
    word: "serendipity",
    source: "en",
    senses: [
      {
        pos: "noun",
        original: "Finding that little bookshop was pure serendipity.",
        en: [
          "The chance discovery of something valuable or pleasant when you were not looking for it.",
          "Finding that little bookshop was pure serendipity.",
        ],
        de: [
          "Ein glücklicher Zufall, durch den man unverhofft etwas Wertvolles oder Schönes entdeckt.",
          "Dass wir diese kleine Buchhandlung fanden, war ein glücklicher Zufall.",
        ],
        fr: [
          "Le fait de découvrir par hasard quelque chose d’utile ou d’agréable que l’on ne cherchait pas.",
          "La découverte de cette petite librairie était un heureux hasard.",
        ],
      },
    ],
  },
  {
    word: "apprendre",
    source: "fr",
    senses: [
      {
        pos: "verb",
        original: "Elle apprend le japonais.",
        en: [
          "To acquire knowledge or a skill through study or experience.",
          "She is learning Japanese.",
        ],
        de: [
          "Sich durch Übung oder Erfahrung Wissen oder eine Fähigkeit aneignen; lernen.",
          "Sie lernt Japanisch.",
        ],
        fr: [
          "Acquérir des connaissances ou une compétence par l’étude ou l’expérience.",
          "Elle apprend le japonais.",
        ],
      },
      {
        pos: "verb",
        original: "Il m’a appris la nouvelle ce matin.",
        en: [
          "To tell someone information or make something known to them.",
          "He told me the news this morning.",
        ],
        de: [
          "Jemandem eine Information mitteilen oder etwas beibringen.",
          "Er hat mir die Neuigkeit heute Morgen mitgeteilt.",
        ],
        fr: [
          "Communiquer une information à quelqu’un ou lui enseigner quelque chose.",
          "Il m’a appris la nouvelle ce matin.",
        ],
      },
    ],
  },
  {
    word: "光",
    source: "ja",
    senses: [
      {
        pos: "noun",
        original: "窓から光が差し込む。",
        en: [
          "Light: the brightness that makes things visible.",
          "Light shines through the window.",
        ],
        de: [
          "Licht: die Helligkeit, durch die Dinge sichtbar werden.",
          "Licht fällt durch das Fenster.",
        ],
        fr: [
          "La lumière : ce qui éclaire et rend les choses visibles.",
          "La lumière entre par la fenêtre.",
        ],
      },
      {
        pos: "noun",
        original: "彼女の言葉に希望の光を見いだした。",
        en: ["A figurative ray of hope or promise.", "I found a ray of hope in her words."],
        de: [
          "Im übertragenen Sinn ein Lichtblick oder ein Zeichen der Hoffnung.",
          "In ihren Worten fand ich einen Hoffnungsschimmer.",
        ],
        fr: [
          "Au sens figuré, une lueur d’espoir.",
          "J’ai trouvé une lueur d’espoir dans ses paroles.",
        ],
      },
    ],
  },
  {
    word: "كتاب",
    source: "ar",
    senses: [
      {
        pos: "noun",
        original: "قرأت كتابًا عن التاريخ.",
        en: ["A book: a written or printed work made up of pages.", "I read a book about history."],
        de: [
          "Ein Buch: ein geschriebenes oder gedrucktes Werk aus Seiten.",
          "Ich las ein Buch über Geschichte.",
        ],
        fr: [
          "Un livre : un ouvrage écrit ou imprimé composé de pages.",
          "J’ai lu un livre sur l’histoire.",
        ],
      },
    ],
  },
  {
    word: "Gift",
    source: "de",
    senses: [
      {
        pos: "noun",
        original: "Das Gift ist für Menschen gefährlich.",
        en: [
          "Poison: a substance that can harm or kill when absorbed by a living organism.",
          "The poison is dangerous to humans.",
        ],
        de: [
          "Ein Stoff, der einen lebenden Organismus schädigen oder töten kann.",
          "Das Gift ist für Menschen gefährlich.",
        ],
        fr: [
          "Un poison : une substance qui peut nuire à un organisme vivant ou le tuer.",
          "Ce poison est dangereux pour les humains.",
        ],
      },
    ],
    alternatives: [
      {
        language: "en",
        previews: {
          en: "A present given to someone, or a natural ability.",
          de: "Ein Geschenk oder eine natürliche Begabung.",
          fr: "Un cadeau ou un talent naturel.",
        },
      },
    ],
  },
  {
    word: "Gift",
    source: "en",
    senses: [
      {
        pos: "noun",
        original: "She gave him a gift for his birthday.",
        en: [
          "Something given freely to another person; a present.",
          "She gave him a gift for his birthday.",
        ],
        de: [
          "Etwas, das man jemandem freiwillig überlässt; ein Geschenk.",
          "Sie gab ihm ein Geschenk zum Geburtstag.",
        ],
        fr: [
          "Une chose offerte à quelqu’un ; un cadeau.",
          "Elle lui a offert un cadeau pour son anniversaire.",
        ],
      },
      {
        pos: "noun",
        original: "He has a gift for languages.",
        en: ["A natural ability or talent.", "He has a gift for languages."],
        de: ["Eine natürliche Fähigkeit oder Begabung.", "Er hat eine Begabung für Sprachen."],
        fr: ["Une aptitude naturelle ou un talent.", "Il a un don pour les langues."],
      },
    ],
    alternatives: [
      {
        language: "de",
        previews: {
          en: "A substance that can harm or kill: poison.",
          de: "Ein Stoff, der einen Organismus schädigen oder töten kann.",
          fr: "Une substance toxique : un poison.",
        },
      },
    ],
  },
];
export function fixtureFor(card: Card) {
  return fixtures.find(
    (f) =>
      f.word.normalize("NFC") === card.expression.normalize("NFC") &&
      (!card.sourceHint || f.source === card.sourceHint),
  );
}
export function resolveFixture(card: Card) {
  const f = fixtureFor(card);
  return f
    ? {
        sourceLanguage: f.source,
        inferred: !card.sourceHint,
        meanings: f.senses.map((s) => ({ gloss: s.en[0], partOfSpeech: s.pos })),
        alternatives: (f.alternatives ?? []).map((a) => ({
          language: a.language,
          previews: Object.entries(a.previews).map(([language, text]) => ({ language, text })),
        })),
      }
    : { sourceLanguage: null, inferred: false, meanings: [], alternatives: [] };
}
export function pageFixture(card: Card, spec: PageSpec) {
  const f = fixtureFor(card);
  if (!f)
    throw new DomainError(
      422,
      "This expression is outside the sample vocabulary. It is saved for a configured AI provider.",
    );
  if (!["en", "de", "fr"].includes(spec.language))
    throw new DomainError(
      422,
      "Sample answer pages are available in English, German, and French. This language needs the live provider.",
    );
  return {
    language: spec.language,
    inventoryId: card.inventoryId,
    meanings: f.senses.map((s, i) => {
      const pair = s[spec.language as "en" | "de" | "fr"];
      let example: Example | null = null;
      if (spec.examples)
        example = {
          original: card.preset.examplePolicy !== "translated" ? s.original : null,
          translated:
            card.preset.examplePolicy === "translated" ||
            (card.preset.examplePolicy === "both" && spec.language !== f.source)
              ? pair[1]
              : null,
        };
      return { meaningId: card.meanings[i].id, explanation: pair[0], example };
    }),
  };
}
