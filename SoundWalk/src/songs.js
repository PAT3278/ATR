/*
 * SOUND WALK — songs and places.
 *
 * This is the only file you need to edit to change what is on the map:
 *   - x / z      where the place's viewpoint is, in metres (the start plaza is at 0, 0; keep within ±70)
 *   - scene      which landscape is built around it and which scenery plays when you look at the view
 *                ('keyaki' | 'tama' | 'flip' | 'stereotype' | 'flash'; anything else gets a generic stage)
 *   - src        the real audio file. Leave null to play the built-in generative sketch instead.
 *                Put files in ../audio/ and serve the folder over http (see README) — e.g. 'audio/keyaki.mp3'.
 *   - sketch     which generative sketch plays while src is null (same names as scene)
 *   - links      buttons on the view card. kind 'buy' is highlighted.
 *   - price      yen. Used only when CONFIG.checkoutEndpoint is set (direct sale via Stripe Checkout).
 */
window.SW = window.SW || {};

SW.CONFIG = {
  title: 'SOUND WALK',
  artist: 'NS HACK',
  // Direct sales through Stripe Checkout. Leave null to use only the store links on each song.
  // When this page is served from the NS HACK site, point it at that site's endpoint:
  //   checkoutEndpoint: '/api/stripe/checkout'
  // The endpoint receives { items: [{ name, price, quantity }] } and should answer { url } (or { sessionId }).
  // Next show, shown in the live house beside the riverside (TAMA EXPRESSION). Edit here when it changes.
  live: { date: '12.26', place: 'TOKYO' },
  // Where the train at the station above the live house takes you: another site, opened after a "go there?" prompt.
  // Set url to null to leave the train as scenery.
  shop: { name: 'CLOSET QUEST', url: 'https://claude.ai/artifact/Nb3fetixjJJ4mQEfbmMq58' },
  checkoutEndpoint: null,
  stripePublishableKey: null, // only needed if the endpoint answers { sessionId } instead of { url }
};

SW.SONGS = [
  {
    id: 'keyaki',
    title: 'KEYAKI',
    year: '2024',
    place: '欅並木',
    placeEn: 'ZELKOVA AVENUE',
    caption: '木漏れ日がビートで揺れる並木道。歩くほど葉が降ってくる。',
    x: -34, z: -36,
    scene: 'keyaki',
    sketch: 'keyaki',
    src: null,
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
    color: '#ff4fb0',
    price: 250,
    links: [
      { kind: 'buy', label: '配信ストアで買う', url: 'https://linkco.re/a9tT7Q6h' },
    ],
  },
  {
    id: 'stereotype',
    title: 'STEREOTYPE',
    year: '',
    place: '量産型の広場',
    placeEn: 'MONOCHROME GRID',
    caption: '同じ形が同じ動きで並ぶ。ひとつだけ、色が違う。',
    x: 26, z: -50,
    scene: 'stereotype',
    sketch: 'stereotype',
    src: null,
    color: '#DCA3C2',
    price: 200,
    links: [
      { kind: 'listen', label: 'SoundCloudで聴く', url: 'https://soundcloud.com/user-602465602/stereotype' },
    ],
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
    color: '#5fd0ff',
    price: 250,
    links: [],
  },
];
