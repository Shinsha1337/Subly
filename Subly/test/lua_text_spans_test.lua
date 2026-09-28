package.path = package.path .. ";./lua/modules/?.lua"

local text_spans = require("text_spans")

local function expect(value, expected, message)
    if value ~= expected then
        error((message or "assertion failed") .. ": expected " .. tostring(expected) .. ", got " .. tostring(value))
    end
end

local cjk = text_spans.build("今日はいい", {
    { text = "今日" },
    { text = "は" },
    { text = "いい" },
})
expect(#cjk, 3, "CJK span count")
expect(cjk[1].startIndex, 0, "first CJK start")
expect(cjk[1].endIndex, 1, "first CJK end")
expect(cjk[2].startIndex, 2, "second CJK start")
expect(cjk[2].endIndex, 2, "second CJK end")
expect(cjk[3].startIndex, 3, "third CJK start")
expect(cjk[3].endIndex, 4, "third CJK end")

local latin = text_spans.build("Hello there", {
    { text = "Hello" },
    { text = "there" },
})
expect(#latin, 2, "Latin span count")
expect(latin[1].startIndex, 0, "first Latin start")
expect(latin[1].endIndex, 4, "first Latin end")
expect(latin[2].startIndex, 6, "second Latin start")
expect(latin[2].endIndex, 10, "second Latin end")

local fallback = text_spans.build("Hello there")
expect(#fallback, 2, "fallback span count")
expect(fallback[2].startIndex, 6, "fallback second start")

print("lua_text_spans_test: PASS")
