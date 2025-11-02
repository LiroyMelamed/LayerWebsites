import React from 'react';
import FredokaText from './FredokaText';
import AppText from './AppText';

// Text Components for different sizes
// Default app text (uses global font stack)
export const Text12 = (props) => <AppText size={12} {...props} />;
export const Text14 = (props) => <AppText size={14} {...props} />;
export const Text16 = (props) => <AppText size={16} {...props} />;
export const Text18 = (props) => <AppText size={18} {...props} />;
export const Text20 = (props) => <AppText size={20} {...props} />;
export const Text24 = (props) => <AppText size={24} {...props} />;
export const Text28 = (props) => <AppText size={28} {...props} />;
export const Text32 = (props) => <AppText size={32} {...props} />;
export const Text36 = (props) => <AppText size={36} {...props} />;
export const Text40 = (props) => <AppText size={40} {...props} />;

// Bold Text Components for different sizes
export const TextBold12 = (props) => <AppText size={12} fontWeight={500} {...props} />;
export const TextBold14 = (props) => <AppText size={14} fontWeight={500} {...props} />;
export const TextBold16 = (props) => <AppText size={16} fontWeight={500} {...props} />;
export const TextBold18 = (props) => <AppText size={18} fontWeight={500} {...props} />;
export const TextBold20 = (props) => <AppText size={20} fontWeight={500} {...props} />;
export const TextBold24 = (props) => <AppText size={24} fontWeight={500} {...props} />;
export const TextBold28 = (props) => <AppText size={28} fontWeight={500} {...props} />;
export const TextBold32 = (props) => <AppText size={32} fontWeight={500} {...props} />;
export const TextBold36 = (props) => <AppText size={36} fontWeight={500} {...props} />;
export const TextBold40 = (props) => <AppText size={40} fontWeight={500} {...props} />;

