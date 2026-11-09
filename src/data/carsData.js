export const CARS = [
  {
    id: 'gt',
    name: 'Ashi GT Supercar',
    nameTh: 'อาชิ GT ซูเปอร์คาร์',
    tag: 'SPEED DEMON',
    desc: 'รถสปอร์ตแอโรไดนามิกส์ทรงต่ำ ความเร็วระดับกำลังดี ควบคุมง่าย สปีดปลายไหลลื่น',
    stats: {
      speed: 80,
      accel: 78,
      handling: 85,
      drift: 82,
      boost: 85
    },
    physics: {
      maxSpeed: 23,     // ~83 km/h
      accelRate: 15,
      brakeRate: 24,
      turnRate: 2.8,
      grip: 0.94,
      driftGrip: 0.85,
      mass: 1200
    },
    defaultColor: '#ff2255'
  },
  {
    id: 'kart',
    name: 'Ashi Kart 500',
    nameTh: 'โกคาร์ท อาชิซิ่ง',
    tag: 'DRIFT KING',
    desc: 'ขนาดเล็กกระทัดรัด เข้าโค้งคมกริบ ขับสนุก ไม่เร็วเกินไป เลี้ยวง่ายสุดๆ',
    stats: {
      speed: 72,
      accel: 88,
      handling: 95,
      drift: 95,
      boost: 80
    },
    physics: {
      maxSpeed: 21,     // ~76 km/h
      accelRate: 18,
      brakeRate: 26,
      turnRate: 3.3,
      grip: 0.92,
      driftGrip: 0.88,
      mass: 850
    },
    defaultColor: '#00d2ff'
  },
  {
    id: 'truck',
    name: 'Ashi Cyber Truck',
    nameTh: 'อาชิ ไซเบอร์ทรัค',
    tag: 'HEAVY BEAST',
    desc: 'รถกระบะเหล็กกล้า ตัวถังทนทาน มั่นคง เข้าโค้งนิ่ง ขี่สบาย',
    stats: {
      speed: 75,
      accel: 72,
      handling: 74,
      drift: 75,
      boost: 85
    },
    physics: {
      maxSpeed: 22,     // ~79 km/h
      accelRate: 14,
      brakeRate: 23,
      turnRate: 2.6,
      grip: 0.96,
      driftGrip: 0.82,
      mass: 2200
    },
    defaultColor: '#00ff88'
  },
  {
    id: 'f1',
    name: 'Ashi Formula-X',
    nameTh: 'อาชิ ฟอร์มูล่า วัน',
    tag: 'ULTIMATE RACER',
    desc: 'รถแข่งล้อเปิดสไตล์โปร เกาะถนนหนึบ เร่งติดเท้า บังคับสั่งได้ดั่งใจ',
    stats: {
      speed: 86,
      accel: 84,
      handling: 90,
      drift: 72,
      boost: 88
    },
    physics: {
      maxSpeed: 25,     // ~90 km/h
      accelRate: 17,
      brakeRate: 28,
      turnRate: 3.0,
      grip: 0.97,
      driftGrip: 0.80,
      mass: 950
    },
    defaultColor: '#ffd700'
  },
  {
    id: 'muscle',
    name: 'Ashi Muscle V8',
    nameTh: 'มัสเซิลคาร์ V8 อาชิ',
    tag: 'DRIFT MACHINE',
    desc: 'เครื่องยนต์ V8 ทรงพลัง ท้ายปัดดริฟต์สนุก ควบคุมนุ่มนวลขึ้น',
    stats: {
      speed: 78,
      accel: 80,
      handling: 78,
      drift: 90,
      boost: 82
    },
    physics: {
      maxSpeed: 23,     // ~83 km/h
      accelRate: 15,
      brakeRate: 25,
      turnRate: 2.7,
      grip: 0.90,
      driftGrip: 0.85,
      mass: 1500
    },
    defaultColor: '#9d4edd'
  }
];
