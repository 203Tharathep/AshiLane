// ===================================================================
// AshiLane Track (Stage) Definitions
// -------------------------------------------------------------------
// Every track is a flat closed loop described by [x, z] control points.
// Rules for authoring new tracks:
//   * The first point must be (0, 0) and the circuit must run along +Z
//     there (start / finish straight). The last points should approach
//     the origin along the X = 0 line so the grid sits on a straight.
//   * Keep >= 45 m between non-adjacent sections so barriers never cross.
//   * Item boxes / boost pads / tunnels are expressed as fractions (0..1)
//     of the lap distance.
// ===================================================================

export const TRACKS = [
  {
    id: 'beach',
    name: 'Sunset Beach Speedway',
    nameTh: 'ซันเซ็ตบีช สปีดเวย์',
    stageLabel: 'ด่าน 1',
    difficulty: 1,
    desc: 'สนามริมทะเลยามเย็น ถนนกว้าง โค้งยาวไหลลื่น เหมาะกับการฝึกดริฟต์และจังหวะไนโตร',
    defaultLaps: 3,
    trackWidth: 22,
    aiSpeedMul: 0.90,
    points: [
      [0, 0, 0], [0, 0, 95], [35, 2.5, 175], [110, 8.5, 225], [205, 13.5, 200],
      [265, 11.0, 120], [225, 5.5, 45], [130, 1.5, 40], [115, 0, -40], [205, 0, -85],
      [275, 3.0, -165], [220, 6.5, -260], [115, 4.0, -280], [45, 1.5, -210],
      [-40, 0, -230], [-95, 0, -170], [-45, 0, -110], [0, 0, -75]
    ],
    itemClusters: [0.16, 0.42, 0.68, 0.88],
    boostPads: [0.06, 0.34, 0.56, 0.92],
    tunnel: [0.79, 0.85],
    theme: {
      sky: 0xff9e6b,
      fog: 0xffb98a,
      fogDensity: 0.0024,
      exposure: 1.05,
      ambient: 0xffe2c4,
      ambientIntensity: 0.75,
      hemiSky: 0xffc89a,
      hemiGround: 0x6a4a2a,
      sun: 0xffd2a0,
      sunIntensity: 1.6,
      ground: '#d8b47c',
      groundDetail: '#c9a066',
      farGround: 0x1f8fb3,
      tarmac: '#2a2a30',
      railA: 0xff7a00,
      railB: 0x00c8ff,
      skyline: 'resort',
      props: 'palms',
      weather: null,
      holograms: false
    }
  },
  {
    id: 'buriram',
    name: 'Buriram Night GP',
    nameTh: 'บุรีรัมย์ ไนท์ กรังด์ปรีซ์',
    stageLabel: 'ด่าน 2',
    difficulty: 2,
    desc: 'สนามกลางคืนแสงนีออน มีอุโมงค์ไฟและแฮร์พินกลางสนาม ต้องเบรกให้ถูกจังหวะ',
    defaultLaps: 3,
    trackWidth: 20,
    aiSpeedMul: 0.95,
    points: [
      [0, 0, 0], [0, 0, 90], [40, 0, 145], [80, 0, 205], [50, 0, 255],
      [-45, 0, 255], [-140, 0, 255], [-215, 3.0, 235], [-245, 8.5, 155],
      [-190, 13.5, 95], [-105, 15.0, 125], [-45, 15.0, 175], [-45, 15.0, 255],
      [-45, 15.0, 335], [-25, 13.5, 415], [55, 9.5, 455], [150, 4.5, 425],
      [210, 1.0, 345], [225, 0, 250], [180, 0, 160], [220, 0, 65], [185, 0, -35],
      [115, 0, -120], [35, 0, -135], [0, 0, -75]
    ],
    itemClusters: [0.14, 0.38, 0.62, 0.86],
    boostPads: [0.04, 0.18, 0.45, 0.72, 0.93],
    tunnel: [0.77, 0.84],
    theme: {
      sky: 0x0a0c18,
      fog: 0x0a0c18,
      fogDensity: 0.0035,
      exposure: 1.1,
      ambient: 0xb0c4de,
      ambientIntensity: 0.6,
      hemiSky: 0x3a4a8a,
      hemiGround: 0x101018,
      sun: 0xcfdcff,
      sunIntensity: 1.2,
      ground: '#0b0c14',
      groundDetail: '#1b2238',
      farGround: 0x05060c,
      tarmac: '#1c1e24',
      railA: 0xff0055,
      railB: 0x00f3ff,
      skyline: 'city',
      props: 'lamps',
      weather: null,
      holograms: true
    }
  },
  {
    id: 'snow',
    name: 'Frosty Peak Circuit',
    nameTh: 'ยอดเขาหิมะ เซอร์กิต',
    stageLabel: 'ด่าน 3',
    difficulty: 3,
    desc: 'สนามเทคนิคบนภูเขาหิมะ โค้ง S ต่อเนื่องและแฮร์พินแคบ คู่แข่งเก่งขึ้นอย่างเห็นได้ชัด',
    defaultLaps: 3,
    trackWidth: 20,
    aiSpeedMul: 1.0,
    points: [
      [0, 0, 0], [0, 0, 95], [-30, 2.0, 165], [-115, 6.5, 195],
      [-205, 11.0, 145], [-255, 15.0, 225], [-195, 17.5, 315], [-90, 17.5, 345],
      [15, 15.0, 365], [125, 10.5, 330], [200, 6.5, 255], [140, 3.5, 175],
      [220, 1.5, 105], [255, 0, 10], [195, 0, -75], [105, 0, -55],
      [80, 0, -135], [18, 0, -165], [0, 0, -85]
    ],
    itemClusters: [0.14, 0.42, 0.66, 0.87],
    boostPads: [0.05, 0.29, 0.52, 0.92],
    tunnel: [0.32, 0.39],
    theme: {
      sky: 0xbcd7ee,
      fog: 0xd6e6f5,
      fogDensity: 0.0042,
      exposure: 1.0,
      ambient: 0xdbe9ff,
      ambientIntensity: 0.8,
      hemiSky: 0xe6f2ff,
      hemiGround: 0x8899aa,
      sun: 0xffffff,
      sunIntensity: 1.3,
      ground: '#eef4fb',
      groundDetail: '#d5e2f0',
      farGround: 0xe9f1fa,
      tarmac: '#2b2e36',
      railA: 0x3aa0ff,
      railB: 0xffffff,
      skyline: 'mountains',
      props: 'pines',
      weather: 'snow',
      holograms: false
    }
  },
  {
    id: 'volcano',
    name: 'Ashi Volcano Inferno',
    nameTh: 'ภูเขาไฟอาชิ อินเฟอร์โน',
    stageLabel: 'ด่าน 4',
    difficulty: 4,
    desc: 'ด่านสุดท้าย! ทางตรงยาวสุดโหดสลับแฮร์พินความเร็วสูงรอบภูเขาไฟ บอทระดับโปรไม่ยอมแพ้ง่ายๆ',
    defaultLaps: 3,
    trackWidth: 20,
    aiSpeedMul: 1.05,
    points: [
      [0, 0, 0], [0, 0, 95], [-35, 2.5, 170], [-125, 7.5, 205],
      [-215, 12.5, 165], [-265, 16.5, 75], [-195, 16.5, -15], [-115, 15.0, -75],
      [-175, 11.5, -165], [-255, 7.5, -225], [-175, 3.5, -305], [-70, 0.5, -275],
      [40, 0, -300], [150, 0, -270], [235, 2.5, -195], [180, 6.0, -105],
      [265, 7.5, -25], [280, 4.5, 80], [190, 1.5, 130], [105, 0, 50],
      [105, 0, -55], [75, 0, -140], [20, 0, -155], [0, 0, -85]
    ],
    itemClusters: [0.13, 0.36, 0.60, 0.84],
    boostPads: [0.04, 0.22, 0.54, 0.77, 0.93],
    tunnel: [0.50, 0.56],
    theme: {
      sky: 0x2a0c0a,
      fog: 0x3a120c,
      fogDensity: 0.0032,
      exposure: 1.15,
      ambient: 0xff9a7a,
      ambientIntensity: 0.55,
      hemiSky: 0xff5a2a,
      hemiGround: 0x1a0808,
      sun: 0xffb07a,
      sunIntensity: 1.25,
      ground: '#1b0f0d',
      groundDetail: '#ff4a12',
      farGround: 0xff3a0a,
      tarmac: '#1a1a1e',
      railA: 0xff3300,
      railB: 0xffcc00,
      skyline: 'volcano',
      props: 'rocks',
      weather: 'embers',
      holograms: false
    }
  }
];

export const DIFFICULTIES = {
  easy: { label: 'ง่าย', aiMul: 0.9, rubberBand: 0.06 },
  normal: { label: 'ปกติ', aiMul: 1.0, rubberBand: 0.05 },
  hard: { label: 'ยาก', aiMul: 1.07, rubberBand: 0.04 }
};

export function getTrackDef(id) {
  return TRACKS.find(t => t.id === id) || TRACKS[0];
}
