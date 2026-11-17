/**
 * Retratos ilustrados das Lendas (arte do projeto, em /lendas/<arquivo>.webp).
 * A chave é a pessoa (QID do Wikidata), tirada do id da carta: "wd-<QID>-…" ou "sel-<QID>-…".
 * Vale para todas as versões da mesma pessoa (clubes e seleção).
 */
const ART: Record<string, string> = {
  Q12897: 'pele', Q17515: 'maradona', Q1835: 'zidane', Q529207: 'ronaldo', Q39444: 'ronaldinho',
  Q4457: 'beckenbauer', Q17163: 'cruyff', Q615: 'messi', Q11571: 'cristiano-ronaldo', Q180642: 'garrincha',
  Q178649: 'romario', Q47526: 'zico', Q482931: 'puskas', Q4261: 'platini', Q43744: 'gerd-muller',
  Q45901: 'henry', Q21621995: 'mbappe', Q43729: 'iniesta', Q483837: 'modric', Q36386: 'matthaus',
  Q483027: 'maldini', Q178683: 'cafu', Q83329: 'nilton-santos', Q68060: 'buffon', Q107365: 'neuer',
  Q102331: 'socrates', Q220283: 'rivelino', Q311407: 'tostao', Q312486: 'didi', Q210102: 'jairzinho',
  Q295262: 'carlos-alberto-torres', Q299693: 'djalma-santos', Q483577: 'rivaldo', Q531814: 'kaka', Q142794: 'neymar',
  Q429039: 'roberto-carlos', Q312454: 'falcao', Q164546: 'di-stefano', Q162043: 'eusebio', Q171583: 'bobby-charlton',
  Q164521: 'best', Q67964: 'baggio', Q189984: 'baresi', Q17500: 'xavi', Q43926: 'pirlo',
  Q173972: 'gullit', Q483145: 'figo', Q46896: 'ibrahimovic', Q11584: 'casillas', Q180661: 'zoff',
  Q20110: 'totti', Q624: 'del-piero', Q102027: 'cannavaro', Q299608: 'scirea', Q52876: 'zanetti',
  Q131261: 'kahn', Q43682: 'lahm', Q131234: 'kroos', Q43666: 'thomas-muller', Q151269: 'lewandowski',
  Q43913: 'robben', Q185389: 'bergkamp', Q187125: 'stoichkov', Q1255625: 'etoo', Q26517: 'luis-suarez',
  Q483309: 'sergio-ramos', Q1912: 'benzema', Q487155: 'hugo-sanchez', Q192965: 'riquelme', Q10520: 'beckham',
  Q170328: 'cantona', Q266613: 'rooney', Q357984: 'de-bruyne', Q280306: 'gerson', Q207085: 'zizinho',
  Q311739: 'leonidas', Q355742: 'ademir-da-guia', Q332012: 'ademir-menezes', Q509491: 'pepe', Q612073: 'coutinho',
  Q311511: 'zagallo', Q262826: 'bellini', Q463460: 'mauro-ramos', Q969872: 'leandro', Q2570335: 'dirceu-lopes',
  Q257606: 'gilmar', Q274872: 'emerson-leao', Q342474: 'marcos', Q1249859: 'rogerio-ceni', Q210453: 'thiago-silva',
  Q156822: 'lucio', Q172720: 'daniel-alves', Q170452: 'adriano',
  Q187159: 'jordi-alba', Q163750: 'jorginho-campos', Q208050: 'bonucci', Q180326: 'thuram', Q483417: 'rio-ferdinand',
  Q2119081: 'wladimir', Q374189: 'alan-hansen', Q2566025: 'altair', Q859743: 'bigode', Q705942: 'brito',
  Q214903: 'godin', Q235159: 'bergomi', Q1033783: 'gustavo-gomez', Q216917: 'stam', Q2565969: 'jair-marinho',
  Q161571: 'mascherano', Q714500: 'oscar-bernardi', Q151260: 'boateng', Q159948: 'augenthaler', Q1353703: 'luizinho',
  Q193625: 'desailly', Q110053: 'hummels', Q318119: 'miranda', Q919825: 'nelinho', Q163564: 'vidic',
  Q721984: 'de-sordi', Q312626: 'tardelli', Q315839: 'gentile', Q233819: 'neeskens', Q11576: 'raul',
  Q1354960: 'salah', Q73360: 'courtois', Q188544: 'dida', Q182459: 'julio-cesar', Q920039: 'cassio',
  Q18237361: 'alisson', Q182314: 'schmeichel', Q482955: 'van-der-sar', Q483137: 'cech', Q44194: 'sepp-maier',
  Q372092: 'zito', Q742644: 'reinaldo', Q152871: 'rummenigge', Q170376: 'batistuta', Q38136: 'marcelo',
  Q161069: 'david-silva', Q167790: 'cavani', Q80471: 'klose', Q49704: 'busquets', Q17507: 'pique',
  Q17158: 'puyol', Q205499: 'hierro', Q41235: 'butragueno', Q184586: 'bale', Q310981: 'figueroa',
  Q485697: 'pepe-real-madrid', Q215963: 'zubizarreta', Q703920: 'barbosa', Q667127: 'castilho', Q953573: 'danrlei',
  Q677923: 'fabio', Q1907: 'lloris', Q984275: 'manga', Q163666: 'pepe-reina', Q1616952: 'raul-plassmann',
  Q363148: 'ray-clemence', Q563649: 'victor', Q954475: 'waldir-peres', Q196897: 'zetti', Q159045: 'brehme',
  Q68064: 'cabrini', Q219390: 'facchetti', Q80306: 'chiellini', Q550019: 'roberto-dinamite', Q1345763: 'renato-gaucho',
  Q445541: 'edmundo', Q58441: 'robinho', Q717927: 'domingos-da-guia', Q312772: 'fred', Q517914: 'dada-maravilha',
  Q13646572: 'gabigol', Q616664: 'casemiro', Q177686: 'maicon', Q190142: 'gilberto-silva', Q28967995: 'haaland',
  Q66241169: 'bellingham', Q969725: 'kane', Q20994118: 'rodri', Q119562: 'aguero', Q48892: 'drogba',
  Q41533: 'lampard', Q459830: 'gerrard', Q45613: 'scholes', Q10524: 'giggs', Q45626: 'van-nistelrooy',
  Q41244: 'shevchenko', Q1918: 'ribery', Q113156: 'pires', Q219248: 'overmars', Q210083: 'francescoli',
  Q483629: 'van-basten', Q46347: 'vieira',
};

/** URL do retrato da Lenda desta carta, ou null quando ela ainda não tem arte. */
export function legendArtUrl(cardId: string | undefined): string | null {
  const qid = cardId ? /^(?:wd|sel)-(Q\d+)-/.exec(cardId)?.[1] : undefined;
  const file = qid ? ART[qid] : undefined;
  return file ? `/lendas/${file}.webp` : null;
}
