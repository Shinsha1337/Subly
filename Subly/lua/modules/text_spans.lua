local M = {}

local function utf8_chars(value)
    value = tostring(value or "")
    local chars = {}
    local pos = 1
    while pos <= #value do
        local byte = value:byte(pos)
        local width = 1
        if byte and byte >= 240 then
            width = 4
        elseif byte and byte >= 224 then
            width = 3
        elseif byte and byte >= 192 then
            width = 2
        end
        local next_pos = math.min(pos + width - 1, #value)
        table.insert(chars, value:sub(pos, next_pos))
        pos = next_pos + 1
    end
    return chars
end

local function same_sequence(chars, start_index, target)
    if #target == 0 or start_index + #target - 1 > #chars then return false end
    for offset, value in ipairs(target) do
        if chars[start_index + offset - 1] ~= value then return false end
    end
    return true
end

local function explicit_spans(text, words)
    if type(words) ~= "table" or #words == 0 then return nil end

    local chars = utf8_chars(text)
    local spans = {}
    local cursor = 1
    for _, word in ipairs(words) do
        local target = utf8_chars(word and word.text or "")
        if #target == 0 then return nil end

        local found = nil
        for candidate = cursor, #chars do
            if same_sequence(chars, candidate, target) then
                found = candidate
                break
            end
        end
        if not found then return nil end

        table.insert(spans, {
            text = table.concat(target, ""),
            startIndex = found - 1,
            endIndex = found + #target - 2,
        })
        cursor = found + #target
    end

    return spans
end

local function whitespace_spans(text)
    local spans = {}
    local chars = utf8_chars(text)
    local in_word = false
    local start_index = 0
    local current = {}

    for i, ch in ipairs(chars) do
        if tostring(ch):match("^%s$") then
            if in_word then
                table.insert(spans, {
                    text = table.concat(current, ""),
                    startIndex = start_index,
                    endIndex = i - 2,
                })
                in_word = false
                current = {}
            end
        else
            if not in_word then
                in_word = true
                start_index = i - 1
                current = {}
            end
            table.insert(current, ch)
        end
    end

    if in_word then
        table.insert(spans, {
            text = table.concat(current, ""),
            startIndex = start_index,
            endIndex = #chars - 1,
        })
    end

    return spans
end

function M.build(text, words)
    return explicit_spans(text, words) or whitespace_spans(text)
end

return M
