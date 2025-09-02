import React, { useEffect, useState } from "react";

const Home = () => {
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("http://localhost:3000")  // <- Ajusta puerto si tu backend es otro
      .then(res => res.text())
      .then(data => setMessage(data))
      .catch(err => setMessage("Error: " + err));
  }, []);

  return (
    <div>
      <h1>Bienvenido a AccESCOM</h1>
      <p>Mensaje del backend: {message}</p>
    </div>
  );
};

export default Home;
