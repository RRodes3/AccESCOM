import React from "react";

function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Panel de Control</h1>
      <p className="text-gray-700">
        Bienvenido al sistema de control de accesos con QR.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-white shadow rounded-xl p-4">
          <h2 className="text-lg font-semibold">Usuarios Registrados</h2>
          <p className="text-2xl font-bold text-blue-600">120</p>
        </div>
        <div className="bg-white shadow rounded-xl p-4">
          <h2 className="text-lg font-semibold">Accesos Hoy</h2>
          <p className="text-2xl font-bold text-green-600">45</p>
        </div>
        <div className="bg-white shadow rounded-xl p-4">
          <h2 className="text-lg font-semibold">Intentos Fallidos</h2>
          <p className="text-2xl font-bold text-red-600">3</p>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
