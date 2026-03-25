import React from 'react';

const Tile = ({ value, row, col }) => {
  // 根据数值确定背景颜色
  const getBackgroundColor = () => {
    switch (value) {
      case 2: return '#eee4da';
      case 4: return '#ede0c8';
      case 8: return '#f2b179';
      case 16: return '#f59563';
      case 32: return '#f67c5f';
      case 64: return '#f65e3b';
      case 128: return '#edcf72';
      case 256: return '#edcc61';
      case 512: return '#edc850';
      case 1024: return '#edc53f';
      case 2048: return '#edc22e';
      default: return '#cdc1b4';
    }
  };

  // 根据数值确定文字颜色
  const getTextColor = () => {
    return value <= 4 ? '#776e65' : '#f9f6f2';
  };

  // 根据数值确定文字大小
  const getTextSize = () => {
    if (value >= 1000) return '24px';
    if (value >= 100) return '32px';
    if (value >= 10) return '40px';
    return '48px';
  };

  return (
    <div
      className="tile"
      style={{
        backgroundColor: getBackgroundColor(),
        color: getTextColor(),
        fontSize: getTextSize(),
      }}
    >
      {value !== 0 && value}
    </div>
  );
};

export default Tile;