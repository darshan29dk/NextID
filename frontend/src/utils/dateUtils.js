/**
 * Date/Time utility helpers to handle timezone offset correction.
 * Datetime rows returned from backend SQLite/SQL usually lack timezone indicators ('Z').
 * This module ensures they are parsed correctly as UTC and converted to local browser time.
 */

export const toUTCString = (dateStr) => {
  if (!dateStr) return '';
  if (typeof dateStr !== 'string') return dateStr;
  
  // If the date string doesn't specify any timezone offset, append 'Z'
  if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-')) {
    return dateStr + 'Z';
  }
  return dateStr;
};

export const formatLocalDateTime = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return new Date(toUTCString(dateStr)).toLocaleString();
  } catch (err) {
    return dateStr;
  }
};

export const formatLocalDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return new Date(toUTCString(dateStr)).toLocaleDateString();
  } catch (err) {
    return dateStr;
  }
};

export const formatLocalTime = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return new Date(toUTCString(dateStr)).toLocaleTimeString();
  } catch (err) {
    return dateStr;
  }
};
