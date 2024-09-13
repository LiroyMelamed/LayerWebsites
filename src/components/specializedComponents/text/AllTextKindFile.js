import React from 'react';
import SimpleText from '../../simpleComponents/SimpleText';

// Text Components for different sizes
export const Text12 = (props) => <SimpleText size={12} {...props} />;
export const Text14 = (props) => <SimpleText size={14} {...props} />;
export const Text16 = (props) => <SimpleText size={16} {...props} />;
export const Text18 = (props) => <SimpleText size={18} {...props} />;
export const Text20 = (props) => <SimpleText size={20} {...props} />;

// Bold Text Components for different sizes
export const TextBold12 = (props) => <SimpleText size={12} bold {...props} />;
export const TextBold14 = (props) => <SimpleText size={14} bold {...props} />;
export const TextBold16 = (props) => <SimpleText size={16} bold {...props} />;
export const TextBold18 = (props) => <SimpleText size={18} bold {...props} />;
export const TextBold20 = (props) => <SimpleText size={20} bold {...props} />;
