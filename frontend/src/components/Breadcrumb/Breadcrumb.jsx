import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import './Breadcrumb.css';

const Breadcrumb = ({ items = [] }) => {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        <li className="breadcrumb-item">
          <a href="#" onClick={(e) => e.preventDefault()} className="breadcrumb-link home-link">
            <Home size={13} />
            <span>Home</span>
          </a>
        </li>
        {items.map((item, idx) => (
          <li key={idx} className="breadcrumb-item">
            <ChevronRight className="breadcrumb-separator" size={13} />
            {item.active ? (
              <span className="breadcrumb-current" aria-current="page">
                {item.label}
              </span>
            ) : (
              <a href="#" onClick={(e) => e.preventDefault()} className="breadcrumb-link">
                {item.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
