"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStoredValue = exports.getStoredValue = void 0;
const getStoredValue = async (key) => {
    return new Promise((resolve) => {
        chrome.storage.local.get(key, (items) => {
            resolve(items[key] ?? null);
        });
    });
};
exports.getStoredValue = getStoredValue;
const setStoredValue = async (key, value) => {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
    });
};
exports.setStoredValue = setStoredValue;
