// Voice preview: six Indian languages, three simple sample utterances each. A SIMULATION. No microphone is used, nothing is
// recorded or played. "Play sample" runs the English equivalent of the utterance through the same intent engine as the chat.
// The sentences were written for this preview and have not been reviewed by a native speaker of each language.

export type VoiceLangId = 'hi' | 'kn' | 'ta' | 'mr' | 'bn' | 'te';

export interface VoiceUtterance {
  /** In the language's own script. */
  script: string;
  /** Latin letters, read the way it sounds. */
  translit: string;
  english: string;
  /** The English sentence the engine is given. */
  engineText: string;
}
export interface VoiceLanguage {
  id: VoiceLangId;
  name: string;
  native: string;
  scriptName: string;
  utterances: VoiceUtterance[];
}

const LEAVE = 'How many leaves do I have left?';
const SALARY = 'When will my salary be credited?';
const HOLIDAY = 'When is the next holiday?';

export const VOICE_LANGUAGES: VoiceLanguage[] = [
  {
    id: 'hi', name: 'Hindi', native: 'हिन्दी', scriptName: 'Devanagari',
    utterances: [
      { script: 'मेरी कितनी छुट्टियाँ बची हैं?', translit: 'Meri kitni chhuttiyan bachi hain?', english: LEAVE, engineText: LEAVE },
      { script: 'मेरी सैलरी कब आएगी?', translit: 'Meri salary kab aayegi?', english: SALARY, engineText: SALARY },
      { script: 'अगली छुट्टी कब है?', translit: 'Agli chhutti kab hai?', english: HOLIDAY, engineText: HOLIDAY },
    ],
  },
  {
    id: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', scriptName: 'Kannada',
    utterances: [
      { script: 'ನನಗೆ ಎಷ್ಟು ರಜೆ ಉಳಿದಿದೆ?', translit: 'Nanage eshtu raje ulidide?', english: LEAVE, engineText: LEAVE },
      { script: 'ನನ್ನ ಸಂಬಳ ಯಾವಾಗ ಬರುತ್ತದೆ?', translit: 'Nanna sambala yavaga baruttade?', english: SALARY, engineText: SALARY },
      { script: 'ಮುಂದಿನ ರಜೆ ಯಾವಾಗ?', translit: 'Mundina raje yavaga?', english: HOLIDAY, engineText: HOLIDAY },
    ],
  },
  {
    id: 'ta', name: 'Tamil', native: 'தமிழ்', scriptName: 'Tamil',
    utterances: [
      { script: 'எனக்கு எத்தனை விடுமுறை மீதம் உள்ளது?', translit: 'Enakku ethanai vidumurai meedham ullathu?', english: LEAVE, engineText: LEAVE },
      { script: 'என் சம்பளம் எப்போது வரும்?', translit: 'En sambalam eppothu varum?', english: SALARY, engineText: SALARY },
      { script: 'அடுத்த விடுமுறை எப்போது?', translit: 'Aduththa vidumurai eppothu?', english: HOLIDAY, engineText: HOLIDAY },
    ],
  },
  {
    id: 'mr', name: 'Marathi', native: 'मराठी', scriptName: 'Devanagari',
    utterances: [
      { script: 'माझ्या किती सुट्ट्या शिल्लक आहेत?', translit: 'Majhya kiti suttya shillak aahet?', english: LEAVE, engineText: LEAVE },
      { script: 'माझा पगार कधी जमा होईल?', translit: 'Majha pagar kadhi jama hoil?', english: SALARY, engineText: SALARY },
      { script: 'पुढची सुट्टी कधी आहे?', translit: 'Pudhchi sutti kadhi aahe?', english: HOLIDAY, engineText: HOLIDAY },
    ],
  },
  {
    id: 'bn', name: 'Bengali', native: 'বাংলা', scriptName: 'Bengali',
    utterances: [
      { script: 'আমার কতগুলো ছুটি বাকি আছে?', translit: 'Amar kotogulo chhuti baki ache?', english: LEAVE, engineText: LEAVE },
      { script: 'আমার বেতন কবে পাব?', translit: 'Amar beton kobe pabo?', english: SALARY, engineText: SALARY },
      { script: 'পরের ছুটি কবে?', translit: 'Porer chhuti kobe?', english: HOLIDAY, engineText: HOLIDAY },
    ],
  },
  {
    id: 'te', name: 'Telugu', native: 'తెలుగు', scriptName: 'Telugu',
    utterances: [
      { script: 'నాకు ఎన్ని సెలవులు మిగిలి ఉన్నాయి?', translit: 'Naaku enni selavulu migili unnayi?', english: LEAVE, engineText: LEAVE },
      { script: 'నా జీతం ఎప్పుడు వస్తుంది?', translit: 'Naa jeetham eppudu vastundi?', english: SALARY, engineText: SALARY },
      { script: 'తదుపరి సెలవు ఎప్పుడు?', translit: 'Tadupari selavu eppudu?', english: HOLIDAY, engineText: HOLIDAY },
    ],
  },
];

export interface CoverageRow {
  id: VoiceLangId;
  speechToText: string;
  textToSpeech: string;
  understanding: string;
  review: string;
  status: 'Sample only';
}
/** What exists today, said plainly. Every row is the same because only three phrases per language are written. */
export const VOICE_COVERAGE: CoverageRow[] = VOICE_LANGUAGES.map((l) => ({
  id: l.id,
  speechToText: 'Not connected',
  textToSpeech: 'Not connected',
  understanding: `${l.utterances.length} sample phrases, matched through their English equivalent`,
  review: 'Not yet reviewed by a native speaker',
  status: 'Sample only' as const,
}));
