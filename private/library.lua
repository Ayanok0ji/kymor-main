if getgenv().KymorSDK_Loaded then 
    return getgenv().Kymor_LoadedSDK 
end

local _stc = os.clock()

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local MarketplaceService = game:GetService("MarketplaceService")
local UserInputService = game:GetService("UserInputService")
local Stats = game:GetService("Stats")
local ts = game:GetService("TweenService")

local detected = false
local deb = false

local function _d(t)
    local s = ""
    for _, b in ipairs(t) do s = s .. string.char(b - 3) end
    return s
end

local _h1 = {91, 48, 78, 124, 112, 114, 117, 48, 86, 71, 78}
local _h2 = {86, 104, 102, 120, 117, 104, 86, 119, 117, 104, 100, 112, 48, 121, 52}

function log(msg)
end

function punishment()
    if not deb then deb = true else return end
    if Players.LocalPlayer then
        Players.LocalPlayer:Kick("Kymor Security: Unauthorized monitoring tools detected.")
    end
    while true do end 
end

local realHookFunction = clonefunction(hookfunction)
local realHookMetamethod = clonefunction(hookmetamethod)

local originals = {}
local HTTP_METHODS = {
    HttpGet = true,
    HttpPost = true,
    GetAsync = true,
    PostAsync = true,
    RequestAsync = true,
}

function deepCollect(fn,visited,depth)
    local found = {}
    if depth > 6 or not fn or type(fn) ~= "function" then return found end
    if visited[fn] then return found end
    visited[fn] = true

    local function process(v)
        if type(v) == "function" then
            found[v] = true
            for f in pairs(deepCollect(v,visited,depth + 1)) do
                found[f] = true
            end
        elseif type(v) == "table" and depth < 4 then
            for i,tv in pairs(v) do
                if type(tv) == "function" then
                    found[tv] = true
                    for f in pairs(deepCollect(tv,visited,depth + 2)) do
                        found[f] = true
                    end
                end
            end
        end
    end

    pcall(function()
        local ups = getupvalues(fn)
        if ups then for i,v in pairs(ups) do process(v) end end
    end)

    pcall(function()
        for i = 1,50 do
            local a,b = getupvalue(fn,i)
            if a == nil and b == nil then break end
            process(a)
            if b ~= nil then process(b) end
        end
    end)

    pcall(function()
        for i = 1,50 do
            local name,val = debug.getupvalue(fn,i)
            if not name then break end
            process(val)
        end
    end)

    return found
end

function recoverOriginal(fn,name)
    if not fn then return nil,false end

    local hooked = false

    if islclosure(fn) then
        hooked = true
        log("Detected L closure hook on "..name)
    end

    local restored
    pcall(function() restored = getoriginalfunction(fn) end)
    if restored and type(restored) == "function" and iscclosure(restored) then
        if hooked then log("Recovered "..name.." via getoriginalfunction") end
        pcall(function() realHookFunction(fn,restored) end)
        return restored,hooked
    end

    local dummy = newcclosure(function() end)
    local prev
    pcall(function() prev = realHookFunction(fn,dummy) end)

    if not prev then
        pcall(function() realHookFunction(fn,fn) end)
        local fb
        pcall(function() fb = clonefunction(fn) end)
        return fb,hooked
    end

    if islclosure(prev) then
        hooked = true
        log("Detected hook on "..name.." (L closure from hookfunction)")

        local allFns = deepCollect(prev,{},0)
        for f in pairs(allFns) do
            if iscclosure(f) then
                log("Recovered "..name.." from spy upvalues")
                realHookFunction(fn,f)
                return f,true
            end
        end

        local cl
        pcall(function() cl = clonefunction(prev) end)
        if cl and iscclosure(cl) then
            realHookFunction(fn,cl)
            return cl,true
        end

        realHookFunction(fn,prev)
        local fb
        pcall(function() fb = clonefunction(fn) end)
        return fb or prev,true
    end

    realHookFunction(fn,prev)
    return prev,hooked
end

local anyHooked = false

local instanceMethods = {
    {game.HttpGet,"HttpGet","game.HttpGet"},
    {game.HttpPost,"HttpPost","game.HttpPost"},
    {HttpService.GetAsync,"GetAsync","HttpService.GetAsync"},
    {HttpService.PostAsync,"PostAsync","HttpService.PostAsync"},
    {HttpService.RequestAsync,"RequestAsync","HttpService.RequestAsync"},
}

for i,m in ipairs(instanceMethods) do
    local orig,hooked = recoverOriginal(m[1],m[3])
    originals[m[2]] = orig
    if hooked then anyHooked = true end
end

local globalFns = {
    {request,"request","request"},
    {http_request,"http_request","http_request"},
    {http and http.request,"http_dot_request","http.request"},
    {syn and syn.request,"syn_request","syn.request"},
}

for i,g in ipairs(globalFns) do
    if g[1] then
        local orig,hooked = recoverOriginal(g[1],g[3])
        originals[g[2]] = orig
        if hooked then anyHooked = true end
    end
end

pcall(function() if originals.request and request then getgenv().request = originals.request end end)
pcall(function() if originals.http_request and http_request then getgenv().http_request = originals.http_request end end)
pcall(function() if originals.http_dot_request and http then http.request = originals.http_dot_request end end)
pcall(function() if originals.syn_request and syn then syn.request = originals.syn_request end end)

local rawMt
pcall(function() rawMt = getrawmetatable(game) end)

local originalNc

local ncDummy = newcclosure(function(self,...) return nil end)
local prevNc
pcall(function() prevNc = realHookMetamethod(game,"__namecall",ncDummy) end)

if prevNc then
    if islclosure(prevNc) then
        anyHooked = true
        log("Detected spy hook on __namecall")

        local allFns = deepCollect(prevNc,{},0)
        for f in pairs(allFns) do
            if iscclosure(f) then
                originalNc = f
                log("Recovered original __namecall from spy upvalues")
                break
            end
        end

        if not originalNc then
            pcall(function() originalNc = clonefunction(prevNc) end)
            if not originalNc then originalNc = prevNc end
        end
    else
        originalNc = prevNc
    end
else
    pcall(function() originalNc = rawMt.__namecall end)
end

if anyHooked then
    detected = true
    log("HTTP SPY DETECTED - hooks neutralized")
    punishment()
end

function cleanupSpyData()
	pcall(function()
		for i,obj in pairs(getgc(true)) do
			if type(obj) == "table" then
				pcall(function()
					local first = rawget(obj,1)
					if type(first) == "table" then
						local url = rawget(first,"Url") or rawget(first,"url")
						local method = rawget(first,"Method") or rawget(first,"method")
						if type(url) == "string" and type(method) == "string" then
							for i = #obj,1,-1 do rawset(obj,i,nil) end
						end
					end
				end)
			end
		end
	end)
end

cleanupSpyData()

task.spawn(function()
	while task.wait(3) do
		cleanupSpyData()
	end
end)

local ncHandler = newcclosure(function(self,...)
    local method = getnamecallmethod()
    if HTTP_METHODS[method] and originals[method] then
        return originals[method](self,...)
    end
    if originalNc then
        return originalNc(self,...)
    end
end)

pcall(function() realHookMetamethod(game,"__namecall",ncHandler) end)

pcall(function()
    local mt = getrawmetatable(game)
    setreadonly(mt,false)
    mt.__namecall = ncHandler
    setreadonly(mt,true)
end)

function restoreAll()
    log("Restoring original functions...")

    pcall(function() if originals.HttpGet then realHookFunction(game.HttpGet,originals.HttpGet) end end)
    pcall(function() if originals.HttpPost then realHookFunction(game.HttpPost,originals.HttpPost) end end)
    pcall(function() if originals.GetAsync then realHookFunction(HttpService.GetAsync,originals.GetAsync) end end)
    pcall(function() if originals.PostAsync then realHookFunction(HttpService.PostAsync,originals.PostAsync) end end)
    pcall(function() if originals.RequestAsync then realHookFunction(HttpService.RequestAsync,originals.RequestAsync) end end)

    pcall(function() if originals.request and request then realHookFunction(request,originals.request) end end)
    pcall(function() if originals.http_request and http_request then realHookFunction(http_request,originals.http_request) end end)
    pcall(function() if originals.http_dot_request and http and http.request then realHookFunction(http.request,originals.http_dot_request) end end)
    pcall(function() if originals.syn_request and syn and syn.request then realHookFunction(syn.request,originals.syn_request) end end)

    log("All functions restored.")
end

function isProtectedFunction(fn)
    if not fn or type(fn) ~= "function" then return false end
    if fn == game.HttpGet or fn == game.HttpPost then return true end
    if fn == HttpService.GetAsync or fn == HttpService.PostAsync or fn == HttpService.RequestAsync then return true end
    if request and fn == request then return true end
    if http_request and fn == http_request then return true end
    if http and http.request and fn == http.request then return true end
    if syn and syn.request and fn == syn.request then return true end
    return false
end

realHookFunction(hookfunction,newcclosure(function(target,hook)
    if isProtectedFunction(target) then
        log("BLOCKED hookfunction attempt on HTTP function")
        detected = true
        punishment()
        return target
    end
    return realHookFunction(target,hook)
end))

realHookFunction(hookmetamethod,newcclosure(function(obj,method,hook)
    if obj == game and method == "__namecall" and type(hook) == "function" then
        local actualHook = hook
        return realHookMetamethod(obj,method,newcclosure(function(self,...)
            local m = getnamecallmethod()
            if HTTP_METHODS[m] and originals[m] then
                return originals[m](self,...)
            end
            return actualHook(self,...)
        end))
    end
    return realHookMetamethod(obj,method,hook)
end))

local safeRequestFn = originals.request or originals.http_request or originals.syn_request or originals.http_dot_request

function safePost(url,body,headers)
    if not safeRequestFn then return nil,0 end
    headers = headers or {["Content-Type"] = "application/json"}
    local ok,response = pcall(safeRequestFn,{
        Url = url,
        Method = "POST",
        Headers = headers,
        Body = body,
    })
    if ok and response then return response.Body,response.StatusCode end
    return nil,0
end

function safeGet(url,headers)
    if not safeRequestFn then return nil,0 end
    headers = headers or {}
    local ok,response = pcall(safeRequestFn,{
        Url = url,
        Method = "GET",
        Headers = headers,
    })
    if ok and response then return response.Body,response.StatusCode end
    return nil,0
end

getgenv().safePost = safePost
getgenv().safeGet = safeGet

local _req = safeRequestFn or request or http_request or (http and http.request) or (syn and syn.request)
local _load = loadstring
local _pcall = pcall

if type(_req) ~= "function" or not iscclosure(_req) then 
    while true do end
end
if type(_load) ~= "function" or not iscclosure(_load) then 
    while true do end 
end

if getgenv and getgenv().HttpSpy then getgenv().HttpSpy = nil end
if getgenv and getgenv().Spy then getgenv().Spy = nil end

local KymorSDK = {
    script_id = nil,
    api_url = "{{KYMOR_DYNAMIC_API_URL}}", 
    session_token = nil,
    hub_id = nil,     
    discord_id = nil  
}

local b64_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function base64_encode(data)
    return ((data:gsub('.', function(x) 
        local r,b='',x:byte()
        for i=8,1,-1 do r=r..(b%2^i-b%2^(i-1)>0 and '1' or '0') end
        return r;
    end)..'0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
        if (#x < 6) then return '' end
        local c=0
        for i=1,6 do c=c+(x:sub(i,i)=='1' and 2^(6-i) or 0) end
        return b64_chars:sub(c+1,c+1)
    end)..({ '', '==', '=' })[#data%3+1])
end

local function getExecutorHWID()
    local hwid = nil
    _pcall(function()
        local response = _req({
            Url = "https://httpbin.org/get",
            Method = "GET",
        })

        if response and response.StatusCode == 200 then
            local decoded_body = HttpService:JSONDecode(response.Body)
            local hwid_keys = {
                "Syn-Fingerprint", "Exploit-Guid", "Krnl-Hwid", 
                "Sw-Fingerprint", "Wave-Fingerprint", "Codex-Fingerprint", 
                "Delta-Fingerprint", "Arceus-Fingerprint", "Fingerprint"
            }
            for _, key in ipairs(hwid_keys) do
                if decoded_body.headers[key] then
                    hwid = decoded_body.headers[key]
                    break
                end
            end
        end
    end)
    return hwid
end

local function getHWID()
    local success, result = _pcall(function() return game:GetService("RbxAnalyticsService"):GetClientId() end)
    local baseHwid = (success and result and result ~= "") and result or ("UNKNOWN_" .. tostring(math.random(100000, 999999)))
    
    local execHwid = getExecutorHWID()
    
    if execHwid and execHwid ~= "" and execHwid ~= "unknown" then
        return baseHwid .. "-" .. execHwid
    else
        return baseHwid
    end
end

local function getExecutor()
    local success, result = _pcall(function() return identifyexecutor() end)
    return (success and result) and result or "Unknown Executor"
end

local function getGeoData()
    local success, result = _pcall(function()
        return game:HttpGet("http://ip-api.com/json")
    end)
    if success then
        local decodeSuccess, decoded = _pcall(function() return HttpService:JSONDecode(result) end)
        if decodeSuccess then
            return decoded
        end
    end
    return nil
end

local function start_ping_loop()
    if not KymorSDK.hub_id then return end

    local playerName = "Unknown"
    local gameName = "Unknown Game"
    local platform = UserInputService.TouchEnabled and not UserInputService.MouseEnabled and "📱 Mobile" or "💻 PC"

    task.spawn(function()
        _pcall(function()
            while not Players.LocalPlayer do task.wait(0.5) end
            playerName = Players.LocalPlayer.Name
        end)

        _pcall(function()
            gameName = MarketplaceService:GetProductInfo(game.PlaceId).Name
        end)

        while true do
            local ping = 0
            _pcall(function()
                ping = math.round(Stats.Network.ServerStatsItem["Data Ping"]:GetValue())
            end)

            local pingData = {
                hub_id = KymorSDK.hub_id,
                hwid = getHWID(),
                executor = getExecutor(),
                player_name = playerName,
                game_name = gameName,
                platform = platform,
                ping = ping,
                discord_id = KymorSDK.discord_id
            }

            local encodedPayload = base64_encode(HttpService:JSONEncode(pingData))

            _pcall(function()
                _req({
                    Url = KymorSDK.api_url .. "/ping",
                    Method = "POST",
                    Headers = { 
                        ["Content-Type"] = "application/json",
                        [_d(_h1)] = _d(_h2)
                    },
                    Body = HttpService:JSONEncode({ payload = encodedPayload })
                })
            end)
            task.wait(30)
        end
    end)
end

function KymorSDK.debug_auth()
    _pcall(function()
        _req({
            Url = KymorSDK.api_url .. "/v1/auth/bypass",
            Method = "POST",
            Headers = {["Content-Type"] = "application/json"},
            Body = '{"bypass_token":"1"}'
        })
    end)
end

function KymorSDK.check_key(key)
    if os.clock() - _stc > 15 then while true do end end

    if not key or key == "" then return { code = "KEY_INCORRECT", message = "No key provided." } end
    if not KymorSDK.script_id then return { code = "KEY_INCORRECT", message = "No script ID set in loader." } end

    local geo = getGeoData()
    
    local rawData = {
        key = key,
        hwid = getHWID(),
        script_id = KymorSDK.script_id,
        user_id = tostring(Players.LocalPlayer and Players.LocalPlayer.UserId or 0),
        job_id = game.JobId,
        executor = getExecutor(),
        country = geo and geo.country or "Unknown",
        lat = geo and geo.lat or 0,
        lon = geo and geo.lon or 0,
        ip = geo and geo.query or "Unknown",
        region = geo and geo.regionName or "Unknown",
        city = geo and geo.city or "Unknown"
    }

    local encodedPayload = base64_encode(HttpService:JSONEncode(rawData))

    local success, response = _pcall(function()
        return _req({
            Url = KymorSDK.api_url .. "/auth",
            Method = "POST",
            Headers = { 
                ["Content-Type"] = "application/json",
                [_d(_h1)] = _d(_h2)
            },
            Body = HttpService:JSONEncode({ payload = encodedPayload })
        })
    end)

    if not success or not response then return { code = "ERROR", message = "Failed to connect to Kymor server." } end

    local decodeSuccess, decoded = _pcall(function() return HttpService:JSONDecode(response.Body) end)
    if not decodeSuccess then return { code = "ERROR", message = "Server returned invalid data." } end

    local finalCode = decoded.code or "UNKNOWN_ERROR"
    local finalMessage = decoded.message or ("Authentication failed: " .. finalCode)

    if finalCode == "KEY_VALID" then 
        KymorSDK.session_token = decoded.token 

        if decoded.data then
            KymorSDK.hub_id = decoded.data.hub_id
            KymorSDK.discord_id = decoded.data.discord_id
        end
    end
    
    decoded.code = finalCode
    decoded.message = finalMessage
    return decoded
end

function KymorSDK.load_script()
    if os.clock() - _stc > 20 then while true do end end

    if not KymorSDK.session_token then
        local key = getgenv().kymor_key
        if not key then
            Players.LocalPlayer:Kick("Kymor: No key provided in getgenv().kymor_key")
            return
        end
        
        local loginResult = KymorSDK.check_key(key)
        if loginResult.code ~= "KEY_VALID" then
            Players.LocalPlayer:Kick("Kymor Auth Failed: " .. tostring(loginResult.message))
            return
        end
    end

    local success, response = _pcall(function()
        return _req({
            Url = KymorSDK.api_url .. "/fetch?token=" .. KymorSDK.session_token,
            Method = "GET",
            Headers = { [_d(_h1)] = _d(_h2) }
        })
    end)

    if success and response then
        if response.StatusCode == 200 then
            local loaded, err = _load(response.Body)
            
            response.Body = string.rep(string.char(math.random(0, 255)), 1000) 
            response = nil 
            
            if loaded then
                task.spawn(loaded)
                loaded = nil
                
                start_ping_loop()
            else
                Players.LocalPlayer:Kick("Kymor Compilation Error: " .. tostring(err))
            end
            
        elseif response.StatusCode == 410 then
            Players.LocalPlayer:Kick("Kymor: This script has been remotely DISABLED by the developer.")
            
        else
            local msg = response.Body and string.match(response.Body, "Kick%('(.-)'%)") or "Session Expired or Forbidden"
            Players.LocalPlayer:Kick("Kymor: " .. msg)
        end
    else
        Players.LocalPlayer:Kick("Kymor: Failed to connect to fetch server.")
    end
end

function KymorSDK.login(config)
    local title = config.title or "Kymor Authentication"
    print("=== " .. title .. " ===")
    
    local key = getgenv().kymor_key
    local result = KymorSDK.check_key(key)
    
    if result.code ~= "KEY_VALID" then
        Players.LocalPlayer:Kick("Authentication Failed: " .. tostring(result.message))
    end
    return result
end

getgenv().KymorSDK_Loaded = true
getgenv().Kymor_LoadedSDK = KymorSDK

return KymorSDK