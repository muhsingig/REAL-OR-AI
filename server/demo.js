// A made-up college group chat so the game can be tried without exporting a real one.
// The fakes are hand-written in each person's style, so the demo plays well offline.

const PEOPLE = {
  Rohan: {
    hours: [19, 20, 21, 22, 9, 10],
    real: [
      'bhai main 15 min mein pahuch raha hu pakka',
      'kal ka plan pakka na? cancel mat karna is baar',
      'auto nahi mil raha bhai 😭 5 min aur',
      'sorry sorry neend lag gayi thi, nikal raha hu',
      'koi chai pe chal raha hai kya abhi',
      'bhai mera charger kisne liya tha last time',
      'pakka aa raha hu, bas ghar pe bata du',
      'order karte hai na yaar, bahar kaun jaayega itni garmi mein',
      'main toh ready hu bas shoes dhundh raha hu',
      'traffic mein phasa hu bhai, signal pe hu',
      'aaj pakka gym jaunga dekhna',
      'kaun kaun aa raha hai sunday ko? count do',
      'bhai mujhe bhi le lena raste mein',
      'haan haan nikal gaya hu',
      'ek ghante mein milte hai, pakka',
      'bro mera order abhi tak nahi aaya 40 min ho gaye',
      'kal raat wala movie ka scene yaad hai 😂',
      'aaj toh bas ghar pe so raha hu, kal pakka',
      'chalo theek hai main 8 baje tak aata hu',
      'bhai location bhej de, maps pe nahi dikh raha',
      'pakka pakka, is baar late nahi hounga',
      'arre main gate pe hu, bahar aao',
    ],
    notes: ['Says "pakka" in almost every plan.', 'Always "10 min". It is never 10 min.', 'Blames autos, traffic and shoes, in that order.'],
    fakes: [
      ['bhai main 10 min mein nikal raha hu pakka, bas naha ke aata hu', 'Always "10 min". It is never 10 min.'],
      ['bhai uber ne cancel kar diya 😭 dusra dhundh raha hu', 'Transport excuses are a whole genre here.'],
      ['pakka aa raha hu is baar, promise wala pakka', '"Pakka" shows up in almost every plan.'],
      ['koi momos khaane chalega kya, main treat dunga (shayad)', 'Food plans at odd hours are on brand.'],
      ['shoes mil gaye bhai, ab bas wallet dhundh raha hu', 'Continues the running excuse from last time.'],
      ['kal ka plan mere ghar pe rakhte hai, sab aa jao 7 baje', 'Plans everything. Arrives last.'],
      ['bhai signal pe hu, bas 2 signal aur', 'Live traffic updates nobody asked for.'],
    ],
  },
  Sneha: {
    hours: [13, 14, 18, 21, 22, 23],
    real: [
      'who finished my maggi and put the empty packet back 😭',
      "guys i'm literally crying this reel is so us",
      "okay but who's bringing snacks to the movie",
      "i'm sooo hungry someone order with me please 😭",
      'not me falling asleep in the lecture again',
      'omg the canteen has momos today run',
      "can someone send the notes i was 'busy'",
      'i need names. who ate the last samosa',
      'this group is so dead today 😭 hello??',
      "okay i'm outside, where are you all",
      "i swear i'll start the diet monday",
      "who wants to split a pizza i'm not eating alone",
      'kabir reply to texts challenge (impossible)',
      'the way i laughed at that 😭😭',
      'pls someone come to the library with me',
      "okay that's it i'm making a group playlist",
      "aditi you're a lifesaver 😭",
      'wait which room is the class in today',
      'i bought another plant. her name is tulsi',
      "rajma at home today, i'm not coming out",
    ],
    notes: ['Uses 😭 for good news and bad news.', 'Will not eat, study or walk anywhere alone.', 'Asks for names after every snack crime.'],
    fakes: [
      ['who took my water bottle from the bench 😭 it had stickers', 'Every snack or bottle theft is a crime scene.'],
      ["okay but who's coming for chai after class, i'm not going alone", 'Refuses to do anything alone. Ever.'],
      ["the canteen guy remembered my order i'm so emotional 😭", '😭 is used for happy news too.'],
      ['can we please plan something this weekend this group is so boring', 'Revives the dead chat at least once a week.'],
      ["i'm starting the diet monday (which monday is not decided)", 'The diet starts every Monday.'],
      ['guys tulsi has a new leaf. she is thriving', 'Plant updates count as news.'],
      ['someone come to the library pls i will buy you a cold coffee', 'Bribes people into company.'],
    ],
  },
  Kabir: {
    hours: [11, 14, 16, 17, 20],
    real: [
      'k', 'sahi', 'aa raha', 'hmm', 'done', 'kal dekhte', 'nahi yaar', 'lol', 'theek hai', 'kaun sa room', 'same',
      'haan bhej diya', 'bas 5 min', 'chalega', 'seen at 2am, reply at 2pm. classic me', 'notes kisi ke paas hai?',
      'acha', 'mera bhi order kar do', 'match dekh raha hu baad mein', 'ok', 'sahi hai', 'k',
    ],
    notes: ['Three words is a long message.', '"k" is a complete sentence.', 'Replies hours later like nothing happened.'],
    fakes: [
      ['haan aa raha', 'Two words is a long message here.'],
      ['theek hai, kal', 'Never uses more words than needed.'],
      ['mera bhi ek chai', 'Only speaks up when food is involved.'],
      ['kaun kaun hai abhi', 'Short, lowercase, no question mark.'],
      ['match ke baad aata', 'Plans revolve around the cricket score.'],
      ['notes bhej do koi', 'Asks for notes, never sends any.'],
    ],
  },
  Aditi: {
    hours: [9, 10, 18, 19, 21, 22],
    real: [
      'GUYS the assignment is due TOMORROW why is nobody panicking',
      "Okay I've made a shared doc, everyone add your part by 9.",
      'Reminder: class is shifted to room 204 tomorrow.',
      'I AM NOT DOING THE WHOLE PPT ALONE AGAIN',
      'Has anyone started the case study? Be honest.',
      'Done with my slides. Rohan, yours?',
      'Please read the brief before asking questions in the group.',
      'WHO CHANGED THE FONT IN OUR DOC',
      "Okay good night, don't forget the 10 am lecture.",
      "I've booked the room for 4. Please be on time.",
      'Sneha I have your notes, collect them tomorrow.',
      "Can we decide the topic today? It's been a week.",
      "Thank you for submitting on time, I'm shocked.",
      'OKAY WHO TOOK MY STAPLER',
      "Let's split the work: intro, research, design, final.",
      'Viva is on Friday. Not Saturday. Friday.',
      "I'm making a checklist, give me 5 minutes.",
      'Updated the doc. Please check your sections.',
      "Fine, I'll present. But you all owe me coffee.",
      'Attendance is 75% minimum, just saying.',
    ],
    notes: ['Full sentences. Full stops. Every time.', 'Switches to ALL CAPS when a deadline is near.', 'Keeps the group alive by handing out work.'],
    fakes: [
      ["Okay I've updated the checklist. Please tick your parts by tonight.", 'Every message has a deadline in it.'],
      ["WHY IS THE DOC EMPTY. IT'S DUE IN TWO HOURS.", 'Switches to ALL CAPS under pressure.'],
      ['Reminder: viva slots are out. Check the sheet before you ask.', 'Answers questions before anyone asks them.'],
      ["Kabir, 'k' is not a status update.", 'Full sentences, full stops, every time.'],
      ["I'll book the room again. Please, this time, be on time.", 'Has booked every room this semester.'],
      ['Can everyone confirm by 8? Just a thumbs up is fine.', 'Runs the group like a project.'],
    ],
  },
  Zoya: {
    hours: [0, 1, 1, 2, 2, 3, 23],
    real: [
      'ngl this song has been on loop since 1am',
      "omg who's awake, i need to talk about this episode",
      "literally can't sleep, sending you all songs instead",
      'okay this playlist is a vibe, adding it to the group',
      'who wants to watch a horror movie friday',
      "i'm outside the cafe, it's closed?? since when",
      "that ending was so bad i'm actually upset",
      'ngl kabir has good music taste, shocking',
      "it's 3am and i'm reorganising my room. normal",
      "concert tickets are out, who's in",
      "wait you guys haven't seen it?? we're watching it this weekend",
      'my sleep schedule is a myth',
      'omg the sunset today, did anyone see',
      "ok i finished the show. i'm empty inside",
      'can we go to that bookstore cafe again',
      'literally the best day, thank you guys',
      'who took the aux last time, it was a crime',
      'send me your top 3 songs right now',
      'the movie was fine. the popcorn was better',
      "good morning (i haven't slept)",
    ],
    notes: ['Busiest hour: 2 am.', '"ngl" and "literally" in half the messages.', 'Sends a playlist instead of a reply.'],
    fakes: [
      ["ngl i've been listening to the same song since 2am, help", 'Most messages arrive after 1 am.'],
      ['okay new rule, whoever picks the movie also brings snacks', 'Movie nights are the whole personality.'],
      ["who's awake. i need to rant about this finale", 'Starts conversations nobody else is awake for.'],
      ['literally made a playlist for each of you. no notes', 'Sends playlists instead of feelings.'],
      ["good night (it's 4am, one more episode)", 'Says good night. Does not sleep.'],
      ['the bookstore cafe has a new cheesecake. this is an emergency', 'Every small thing is literally an event.'],
    ],
  },
  Arjun: {
    hours: [6, 7, 18, 19, 20],
    real: [
      'bro 2 min mein aaya',
      'lmao this is so true',
      'gym chal raha koi kal subah? 6 baje',
      'scenes ho gaye aaj class mein lmao',
      'india ka match hai aaj, kahan dekh rahe hai',
      'bro protein shake spill ho gaya bag mein 💀',
      'leg day tha, ab main chal nahi sakta',
      'turf book kiya hai 7 baje, 10 log chahiye',
      'lmaooo rohan ka face dekh',
      'kal ka plan cancel? scenes',
      'bro bas 2 min, parking dhundh raha hu',
      'kohli ka cover drive bro 🔥',
      'koi badminton khelega shaam ko',
      'mera haath dukh raha hai, too many pushups',
      'bro the canteen guy gave me extra fries lmao',
      'match ke baad dinner? main in hu',
      'rest day aaj, sirf khaana',
      "lmao kabir ne 'k' bheja again",
      'bhai turf pe 2 log kam hai, aao jaldi',
      'cardio is a scam bro',
    ],
    notes: ['"lmao" is the default laugh.', '"2 min" means about 20.', 'Every weekend plan involves a turf.'],
    fakes: [
      ['bro turf 6 baje, abhi tak sirf 4 log hai lmao', 'Every plan involves a turf booking.'],
      ['leg day ke baad stairs is a horror movie bro', 'Gym updates nobody asked for.'],
      ["lmao rohan abhi bhi 'nikal raha hai' 💀", 'Laughs in "lmao" and 💀.'],
      ['match dekhne kaun aa raha, main snacks laaunga', 'Cricket first, plans second.'],
      ['bro 2 min. parking mil gayi bas', '"2 min" means about 20.'],
      ['protein khatam ho gaya bro, scenes ho gaye', 'Everything is "scenes".'],
    ],
  },
};

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const DEMO_GROUP = 'Chai Sutta Club';

// Messages in the same {sender, text, ts} shape a parsed WhatsApp export produces.
export function demoChat() {
  const random = seeded(42);
  const start = Date.UTC(2025, 0, 6);
  const messages = [];
  for (const [sender, person] of Object.entries(PEOPLE)) {
    person.real.forEach((text, i) => {
      const day = Math.floor(random() * 300);
      const hour = person.hours[i % person.hours.length];
      const minute = Math.floor(random() * 60);
      // Wall-clock time stored as UTC, the same way the WhatsApp parser stores it.
      const ts = start + day * 86400000 + hour * 3600000 + minute * 60000;
      messages.push({ sender, text, ts });
    });
  }
  messages.sort((a, b) => a.ts - b.ts);
  return { groupName: DEMO_GROUP, messages };
}

export function demoFakes(name) {
  const person = PEOPLE[name];
  if (!person) return null;
  return {
    notes: person.notes,
    fakes: person.fakes.map(([text, why], i) => ({ text, why, score: 10 - i })),
    dropped: 0,
  };
}
