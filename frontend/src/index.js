import React from 'react'; // frontend/src/index.js
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css'; // importa el CSS de Bootstrap
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; //(opcional) JS de Bootstrap para toggles/collapse del navbar
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import './index.css'; // para estilos propios

ReactDOM.createRoot(document.getElementById('root')).render(<App />);



const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
