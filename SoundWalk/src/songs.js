/*
 * SOUND WALK — songs and places.
 *
 * This is the only file you need to edit to change what is on the map:
 *   - x / z      where the place's viewpoint is, in metres (the start plaza is at 0, 0; keep within ±70)
 *   - scene      which landscape is built around it and which scenery plays when you look at the view
 *                ('keyaki' | 'tama' | 'flip' | 'park' | 'parkwheel' | 'flash' | 'field' | 'shot' | 'ohh'; anything else gets a generic stage)
 *   - src        the real audio file. Leave null to play the built-in generative sketch instead.
 *                Put files in ../audio/ and serve the folder over http (see README) — e.g. 'audio/keyaki.mp3'.
 *   - sketch     which generative sketch plays while src is null (same names as scene)
 *   - links      buttons on the view card. kind 'buy' is highlighted, and is where the buy button goes when there is no shop server.
 *   - price      yen, shown on the buy button. With CONFIG.api set the shop server's catalogue has the final say (it sends its prices).
 *   - access     'preview' | 'full' (default CONFIG.access). Only matters for a real file (src):
 *                preview — until it is bought on this device, the song is only ever heard as random excerpts of CONFIG.preview
 *                          seconds, a different stretch each time, faded in and out: at its place on the map and in the store player alike.
 *                full    — plays through for free, like SoundCloud. The buy button is still there.
 */
window.SW = window.SW || {};

SW.CONFIG = {
  title: 'SOUND WALK',
  artist: 'NS HACK',
  // Next show, shown in the live house beside the riverside (TAMA EXPRESSION). Edit here when it changes.
  live: { date: '12.26', place: 'TOKYO' },
  // Where the train at the station above the live house takes you: another site, opened after a "go there?" prompt.
  // Set url to null to leave the train as scenery.
  shop: { name: 'CLOSET QUEST', url: 'https://claude.ai/artifact/Nb3fetixjJJ4mQEfbmMq58' },
  // The record shop on the plaza and the phone's STORE app sell atr's releases. A song with store: false is left out.
  store: { name: 'ATR RECORDS' },
  // The shop server: the NS HACK site's SOUND WALK API (Stripe Checkout, the purchase check, play counts), e.g.
  //   api: 'https://nshack.example.com/api/soundwalk'
  // Leave null and the buy buttons open each song's store link (kind 'buy') instead, and no play counts are shown.
  api: null,
  access: 'preview',   // for songs without their own access (see the top of this file)
  preview: 20,         // seconds in each preview excerpt
};

SW.SONGS = [
  {
    id: 'keyaki',
    title: 'KEYAKI',
    year: '2024',
    place: 'けやき山の展望台',
    placeEn: 'ZELKOVA LOOKOUT',
    caption: '山道を登りきった先、古いけやきの下の展望台。木漏れ日がビートで揺れ、葉が降ってくる。',
    x: -48, z: -75,   // the summit of the mountain north-west of the plaza (game.js PEAKS); the trail up is places.js PLACES.keyaki
    scene: 'keyaki',
    sketch: 'keyaki',
    src: null,
    access: 'full',   // out on the stores already: free to hear in full
    color: '#b6e07a',
    price: 250,
    links: [
      { kind: 'buy', label: '配信ストアで買う', url: 'https://linkco.re/XzG0GMpc?lang=ja' },
    ],
  },
  {
    id: 'tama',
    title: 'TAMA EXPRESSION',
    year: '2023',
    place: '夕暮れの河川敷',
    placeEn: 'RIVERSIDE AT DUSK',
    caption: '鉄橋を電車が渡るたび、川面の光がリズムを刻む。',
    x: -44, z: 30,
    scene: 'tama',
    sketch: 'tama',
    src: null,
    access: 'full',   // out on the stores already: free to hear in full
    color: '#ffb36b',
    price: 250,
    links: [
      { kind: 'buy', label: '配信ストアで買う', url: 'https://linkco.re/qH1Ec5xc?lang=ja' },
    ],
  },
  {
    id: 'flip',
    title: 'FLIP DA HOODS',
    year: '',
    place: '裏返しの街',
    placeEn: 'UPSIDE-DOWN BLOCKS',
    caption: '夜の交差点。4小節ごとに、街がひっくり返る。',
    x: 54, z: 8,
    scene: 'flip',
    sketch: 'flip',
    src: null,
    access: 'full',   // out on the stores already: free to hear in full
    color: '#a77bff',   // violet (was pink)
    price: 250,
    links: [
      { kind: 'buy', label: '配信ストアで買う', url: 'https://linkco.re/a9tT7Q6h' },
    ],
  },
  // The amusement park: two new songs, each heard riding something. Titles are placeholders until the songs have names.
  // Put the files in audio/ and set src (e.g. 'audio/carousel.mp3'); until then a generated sketch plays.
  {
    id: 'carousel',
    title: 'MERRY-GO-ROUND',
    year: '',
    artist: 'atr',
    place: 'メリーゴーラウンド',
    placeEn: 'CAROUSEL',
    caption: '木馬に乗って、遊園地がゆっくり回る。',
    x: 26, z: -50,
    scene: 'park',
    sketch: 'stereotype',
    src: null,
    access: 'preview',   // unreleased: heard in excerpts until bought
    color: '#e8b23a',
    links: [],
  },
  {
    id: 'wheel',
    title: 'FERRIS WHEEL',
    year: '',
    artist: 'atr',
    place: '観覧車',
    placeEn: 'FERRIS WHEEL',
    caption: 'ゴンドラが上がるにつれて、街の灯りが見えてくる。',
    x: 41.0, z: -70.2,   // the boarding spot in front of the wheel, inside the park (places.js: WX, WZ + 6.2 in the park's frame)
    scene: 'parkwheel',
    sketch: 'flash',
    src: null,
    access: 'preview',   // unreleased: heard in excerpts until bought
    color: '#6cc0e8',
    links: [],
  },
  {
    id: 'nojobb',
    title: 'NO JOBB',
    year: '',
    artistNote: 'TAMA, NS HACK',
    place: '花火の丘',
    placeEn: 'FLASH HILL',
    caption: 'やることのない夜。キックが鳴るたび、空に花火が上がる。',
    x: 14, z: 56,
    scene: 'flash',
    sketch: 'flash',
    src: null,
    access: 'full',   // already public on SoundCloud: free to hear in full
    color: '#8fd3ff',
    price: 200,
    links: [
      { kind: 'listen', label: 'SoundCloudで聴く', url: 'https://soundcloud.com/user-602465602/no-jobb-tama-ns-hack-flash' },
    ],
  },
  {
    id: 'field',
    title: 'FIELD',
    year: '2026',
    artist: 'vas, stvn, p.pulpk, atr',
    place: '摩天楼の戦場',
    placeEn: 'HIGH-RISE FIREFIGHT',
    caption: 'ニューヨークで作った一曲。ガラス張りのフロアで、キックが鳴るたびに撃ち合いが始まる。',
    x: 75, z: 73,
    scene: 'field',
    sketch: 'flip',
    src: 'audio/field.mp3',
    access: 'preview',   // unreleased: heard in excerpts until bought
    // Who has the verse, by time in the track (seconds). The two figures on the brownstone stoops follow this.
    length: 125.2,
    parts: [{ at: 0, who: 'stvn' }, { at: 40, who: 'vas' }, { at: 67, who: 'stvn' }, { at: 95, who: 'vas' }],
    color: '#ff4a3a',
    price: 250,
    links: [],
  },
  {
    id: 'shot',
    title: 'SHOT',
    year: '',
    artist: 'otuyyuto',
    place: '夜の高速',
    placeEn: 'ELEVATED EXPRESSWAY',
    caption: '首都高みたいな高架を、オレンジの灯りの下で駆け抜ける。',
    x: -14, z: -100,
    scene: 'shot',
    sketch: 'shot',
    src: 'audio/shot.mp3',
    access: 'preview',   // unreleased: heard in excerpts until bought
    color: '#ffa53a',
    price: 250,
    links: [],
  },
  {
    id: 'ohh',
    title: 'OHH',
    year: '',
    artist: 'atr',
    place: '海沿いの渓谷',
    placeEn: 'COASTAL GORGE',
    caption: '山と海のあいだの道を、夕日に向かってスピードを上げていく。',
    x: -97, z: -26,
    scene: 'ohh',
    sketch: 'ohh',
    src: 'audio/ohh.mp3',
    access: 'preview',   // unreleased: heard in excerpts until bought
    color: '#5fd0ff',
    price: 250,
    links: [],
  },
];
