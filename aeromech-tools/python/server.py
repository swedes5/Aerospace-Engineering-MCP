"""
Aeromech Tools: local MCP server (runs on your own computer, no network access needed).

Tools:
  - get_isa_atmosphere: 1976 US Standard Atmosphere properties at a geometric altitude
  - cantilever_end_load_deflection: tip deflection and slope of an end-loaded cantilever

Run directly with:  python server.py
Claude Desktop starts it automatically once it is listed in claude_desktop_config.json
(see the README for the config snippet).
"""

from ambiance import Atmosphere
from fastmcp import FastMCP
import pint

ureg = pint.UnitRegistry()
# pint ships with psi and ksi but not Msi (million psi), a common unit for Young's modulus.
ureg.define("Msi = 1e6 * psi")
Q_ = ureg.Quantity

R_GAS = 287.058  # J/(kg*K), specific gas constant for dry air
GAMMA = 1.4      # ratio of specific heats for air

mcp = FastMCP("AeroMech Engineering Tools")


@mcp.tool()
def get_isa_atmosphere(altitude_m: float, delta_t_c: float = 0.0) -> dict:
    """
    Computes standard atmospheric properties (1976 US Standard Atmosphere)
    given geometric altitude in meters and temperature offset in deg C (ISA+dT).
    """
    atm = Atmosphere(altitude_m)
    t_ambient = float(atm.temperature[0]) + delta_t_c
    p_ambient = float(atm.pressure[0])
    rho_ambient = p_ambient / (R_GAS * t_ambient)
    sound_speed = (GAMMA * R_GAS * t_ambient) ** 0.5

    return {
        "altitude_m": altitude_m,
        "temperature_K": round(t_ambient, 2),
        "pressure_Pa": round(p_ambient, 2),
        "density_kg_m3": round(rho_ambient, 4),
        "speed_of_sound_m_s": round(sound_speed, 2),
    }


@mcp.tool()
def cantilever_end_load_deflection(
    load: str, length: str, youngs_modulus: str, moment_of_inertia: str
) -> dict:
    """
    Calculates max deflection and tip slope for a cantilever beam with an end point load.
    Accepts unit strings, e.g.:
      load: '500 N' or '100 lbf'
      length: '2 m' or '36 in'
      youngs_modulus: '70 GPa' or '10 Msi'
      moment_of_inertia: '4.5e-6 m^4' or '12 in^4'
    """
    p = Q_(load)
    l = Q_(length)
    e = Q_(youngs_modulus)
    i = Q_(moment_of_inertia)

    # Fail early with a clear message if a unit is the wrong kind (e.g. a length given as a force).
    for name, qty, dim in [
        ("load", p, "[force]"),
        ("length", l, "[length]"),
        ("youngs_modulus", e, "[pressure]"),
        ("moment_of_inertia", i, "[length] ** 4"),
    ]:
        if not qty.check(dim):
            raise ValueError(f"{name}: '{qty}' does not have units of {dim}")

    delta = (p * l**3) / (3 * e * i)
    theta = (p * l**2) / (2 * e * i)

    return {
        "max_deflection_mm": round(delta.to(ureg.millimeter).magnitude, 4),
        "max_deflection_inches": round(delta.to(ureg.inch).magnitude, 5),
        "slope_at_tip_rad": round(theta.to_base_units().magnitude, 6),
    }


if __name__ == "__main__":
    mcp.run()
