// Short lore blurbs shown on the character sheet. Client-only flavor text.
export const CHARACTER_LORE: Record<string, string> = {
  aeris:
    'Kur vējš griežas, tur Aeris dejo. Katrs solis ir vētras čuksts, katra kustība — brīvības zvērests.',
  terron:
    'Klints, kas iemācījās elpot. Terrons stāv tur, kur citi krīt, un viņa vairogs nes veselu pilsētu svaru.',
  volta:
    'Negaisa lapas šķīst zem viņas pirkstiem. Volta lasa zibeni kā grāmatu un raksta ar pērkonu.',
  silva:
    'Meža acs neko nepalaiž garām. Silva bulta atrod mērķi, pirms tas pat zina, ka ir medīts.',
  marina:
    'Plūdi klausa tikai viņas balsij. Mierīga kā spogulis, nežēlīga kā vilnis — okeāns ir viņas.',
  ignis:
    'Ignis nesa liesmu cauri tūkstoš kaujām un nekad nepazuda tumsā. Viņa uguns kausē pat dzelzi.',
  sarma:
    'Ziemas elpa, kas apstādina laiku. Kur Sarma iet, tur pat gaiss sasalst godbijībā.',
  zefs:
    'Brīvais klejotājs bez mājām un bez saitēm. Zefs pieder vējam, un vējš nepieder nevienam.',
  petra:
    'Akmens dūre, kas nekad neatkāpjas. Petra trieciens ir kā kalns, kas nolaižas uz zemi.',
  zibo:
    'Dzirksteļu zēns ar negaisu asinīs. Zibo smejas, kad debess plīst, jo tā ir viņa mūzika.',
  lapa:
    'Zāļu zinātāja, kas dziedē ar pieskārienu. Lapa zina katras saknes noslēpumu un katras brūces ceļu.',
  rasa:
    'Rīta migla, kas atdzīvina izkaltušo. Rasa nāk klusi un atstāj aiz sevis tikai dzīvību.',
  dzirkste:
    'Ugunskura meita, kas dejo starp liesmām. Dzirkste sirds deg karstāk par jebkuru uguni.',
  stindzis:
    'Sala mednieks, pacietīgs kā ledus. Stindzis bulta lido klusi un sasalst tieši sirdī.',
};

export function loreFor(characterId: string): string {
  return CHARACTER_LORE[characterId] ?? '';
}
