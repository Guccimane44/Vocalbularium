// The Chinese checks' test for simplified characters (0.16.4): common
// characters written only in traditional Chinese, each of which simplified
// Chinese writes another way (語 for 语, 國 for 国). It flags a traditional
// form a provider slips in; characters both systems share are never listed.
const TRADITIONAL = new Set([...
  '語來國學這個們時說為對會樣還從經過後開關長門問間見現發實體點頭東車書買賣詞漢寫讀聽話讓認識歷義氣電機動種處員業標題華號變親應頁顯歡傳進邊鐘錢雙雞魚鳥馬飛風銀鐵樂藥驗觀視覺興舊灣廣產與專雜難響層帶張強總結給紅線練組紹終續網羅繼聯職並麼嗎當幾條極樹橋檢壓屬歲準劃兩嚴麵團無憶聖賽隻裡髮鬆夠圖聲邏輯構萬億總單簡譯藝術顏']);

// The traditional characters in a text, each once, or an empty string.
export const traditionalIn = (text: string) => [...new Set([...text].filter(char => TRADITIONAL.has(char)))].join('');
