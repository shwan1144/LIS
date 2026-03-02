export function mapKeyboardToEnglish(input: string): string {
    if (!input) return input;

    const map: Record<string, string> = {
        // Standard Arabic
        'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'د': ']',
        'ش': 'a', 'س': 's', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ك': ';', 'ط': '\'',
        'ئ': 'z', 'ء': 'x', 'ؤ': 'c', 'ر': 'v', 'ى': 'n', 'ة': 'm', 'و': ',', 'ز': '.', 'ظ': '/',

        // Additional Kurdish/Persian mappings typical on QWERTY
        'چ': '[', 'پ': '\\', 'ژ': ']', 'ڤ': ':', 'گ': '\'', 'ێ': 'e', 'ۆ': 'o', 'ڕ': 'r', 'ڵ': 'l', 'ی': 'd', 'ھ': 'h', 'ڭ': 'g',
    };

    // 'b' key typically inputs the 'لا' ligature in Arabic layouts
    let str = input.replace(/ला/g, 'b').replace(/لا/g, 'b').replace(/ﻻ/g, 'b');

    return str.split('').map(char => map[char] || char).join('');
}
