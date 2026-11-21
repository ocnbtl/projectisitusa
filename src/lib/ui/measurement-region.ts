// Bounded Nov20 program policy: recognized geography plus concrete exceptions.
// This is a privacy control policy, not a claim of worldwide legal certification.
export const ISO_COUNTRIES = new Set("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" "));
const priorChoice = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH TR BR CN".split(" "));
const usStates = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI UM".split(" "));
const replayPriorChoiceUS = new Set("CA CT DE FL IL MD MA MI MT NV NH PA WA".split(" "));
const canadaRegions = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));
export type RegionalDefaults = {known:boolean; aggregate:boolean; heatmaps:boolean; replay:boolean; reason:string};
export function regionalDefaults(country:string|null, region:string|null):RegionalDefaults {
  const off={aggregate:false,heatmaps:false,replay:false};
  if (!country || !ISO_COUNTRIES.has(country)) return {known:false,...off,reason:"unknown-country"};
  if (priorChoice.has(country)) return {known:true,...off,reason:"prior-choice-group"};
  if (country==="CA") {
    if (!region || !canadaRegions.has(region) || region==="QC") return {known:true,...off,reason:"quebec-or-unknown-province"};
    return {known:true,aggregate:true,heatmaps:true,replay:false,reason:"reviewed-canada-replay-prior-choice"};
  }
  if (country==="US") return {known:true,aggregate:true,heatmaps:true,replay:!!region && usStates.has(region) && !replayPriorChoiceUS.has(region),reason:"reviewed-us-with-state-replay-policy"};
  if (country==="AU" || country==="NZ") return {known:true,aggregate:true,heatmaps:true,replay:true,reason:"reviewed-minimized-public-streams"};
  // Identified restrictions: KVKK2022/1358 (TR), ANPD cookie guidance (BR),
  // PIPL article39 overseas disclosure (CN), plus the prior-choice group above.
  // https://www.kvkk.gov.tr/Icerik/7595/2022-1358
  // https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-emite-recomendacoes-para-adequacao-da-pratica-de-coleta-de-cookies-do-portal-gov.br
  // https://en.npc.gov.cn.cdurl.cn/2021-12/29/c_694559_2.htm
  return {known:true,aggregate:true,heatmaps:true,replay:true,reason:"known-country-minimized-public-defaults"};
}
