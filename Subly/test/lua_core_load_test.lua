package.path = package.path .. ";./lua/?.lua;./lua/modules/?.lua"
local core = require("subly_resolve_core")
if type(core) ~= "table" or type(core.Init) ~= "function" then
    error("subly_resolve_core did not return its public API")
end
print("lua_core_load_test: PASS")
