//+------------------------------------------------------------------+
//|                                                AIMT5Bridge.mq5   |
//|                         AI Copilot & Model Context Protocol (MCP)|
//|                                    Copyright 2026, AI MT5 Bridge |
//|                                        http://127.0.0.1:7777     |
//+------------------------------------------------------------------+
#property copyright "AI MT5 Bridge"
#property link      "http://127.0.0.1:7777"
#property version   "2.10"
#property description "Connects MetaTrader 5 to external AI via Local MCP/REST Bridge (http://127.0.0.1:7777)"
#property description "Enables asynchronous AI trade execution, real-time tick streaming, position & risk management."

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\AccountInfo.mqh>
#include <Trade\SymbolInfo.mqh>

//--- Input parameters
input group "=== Bridge Connection Settings ==="
input string   InpBridgeUrl         = "http://127.0.0.1:7777"; // Primary Bridge URL (WebRequest whitelist)
input string   InpBridgeUrlFallback = "http://127.0.0.1:3000/api/mt5"; // Fallback URL (if on port 3000)
input string   InpApiKey            = "mt5_bridge_secret_key"; // Bridge API Secret
input int      InpTimerIntervalMs   = 500;                     // Polling & sync interval (milliseconds)

input group "=== Trade & Execution Parameters ==="
input ulong    InpMagicNumber       = 889900;                  // EA Magic Number for AI Orders
input ulong    InpDefaultSlippage   = 10;                      // Slippage points
input string   InpSymbolsToTrack    = "EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD"; // Symbols for live stream (comma-separated)

input group "=== Trailing Stop & Risk Guard ==="
input bool     InpEnableTrailing    = true;                    // Enable Trailing Stop Engine
input int      InpTrailingPoints    = 150;                     // Trailing Stop Distance (points)
input int      InpTrailingStep      = 30;                      // Trailing Step (points)
input bool     InpAutoSyncTicks     = true;                    // Stream live tick data to Bridge

//--- Global objects
CTrade         m_trade;
CPositionInfo  m_position;
CAccountInfo   m_account;
CSymbolInfo    m_symbol;

//--- State tracking
datetime       g_lastSyncTime = 0;
bool           g_isSyncing = false;
string         g_trackedSymbols[];
int            g_trackedCount = 0;

//--- Execution Result Queue
struct TradeResultItem
{
   string commandId;
   bool   success;
   ulong  dealTicket;
   ulong  orderTicket;
   double executionPrice;
   int    errorCode;
   string errorMessage;
   int    executionTimeMs;
};
TradeResultItem g_resultQueue[20];
int             g_resultCount = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=========================================================");
   Print("  AI MT5 Bridge EA Starting Up...                       ");
   Print("  Target Bridge URL: ", InpBridgeUrl);
   Print("  Magic Number: ", InpMagicNumber);
   Print("=========================================================");

   // Configure trade object
   m_trade.SetExpertMagicNumber(InpMagicNumber);
   m_trade.SetDeviationInPoints(InpDefaultSlippage);
   m_trade.SetTypeFilling(ORDER_FILLING_IOC);

   // Parse symbols to track
   ParseSymbols();

   // Verify WebRequest capability
   char postData[], resultData[];
   string resultHeaders;
   int res = WebRequest("GET", InpBridgeUrl + "/health", "", 1000, postData, resultData, resultHeaders);
   if(res == -1)
   {
      int err = GetLastError();
      Print("WARNING: WebRequest test failed! Error code: ", err);
      Print("IMPORTANT: In MT5, go to: Tools -> Options -> Expert Advisors");
      Print("Check 'Allow WebRequest for listed URL' and add: ", InpBridgeUrl);
      Print("Also add fallback URL if needed: http://127.0.0.1:3000");
   }
   else
   {
      Print("SUCCESS: Connected to AI MT5 Bridge at ", InpBridgeUrl, " (HTTP ", res, ")");
   }

   // Initialize millisecond timer for ultra-fast asynchronous execution
   EventSetMillisecondTimer(InpTimerIntervalMs);

   // Perform immediate initial synchronization to register connection instantly
   SyncWithBridge();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("AI MT5 Bridge EA Deinitialized. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert timer function (High frequency sync)                      |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(g_isSyncing) return;
   g_isSyncing = true;

   // 1. Process local trailing stops if enabled
   if(InpEnableTrailing)
   {
      ProcessTrailingStops();
   }

   // 2. Synchronize with Bridge server
   SyncWithBridge();

   g_isSyncing = false;
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // OnTick serves as immediate trigger if timer is slow
   if(InpAutoSyncTicks && (TimeCurrent() - g_lastSyncTime >= 1))
   {
      // Optional fast tick emit
   }
}

//+------------------------------------------------------------------+
//| Parse comma-separated symbols                                    |
//+------------------------------------------------------------------+
void ParseSymbols()
{
   string temp = InpSymbolsToTrack;
   StringTrimLeft(temp);
   StringTrimRight(temp);
   g_trackedCount = 0;
   
   string sep = ",";
   ushort u_sep = StringGetCharacter(sep, 0);
   StringSplit(temp, u_sep, g_trackedSymbols);
   g_trackedCount = ArraySize(g_trackedSymbols);

   // Always ensure current chart symbol is included
   bool hasCurrent = false;
   for(int i = 0; i < g_trackedCount; i++)
   {
      StringTrimLeft(g_trackedSymbols[i]);
      StringTrimRight(g_trackedSymbols[i]);
      if(g_trackedSymbols[i] == _Symbol) hasCurrent = true;
   }
   if(!hasCurrent)
   {
      ArrayResize(g_trackedSymbols, g_trackedCount + 1);
      g_trackedSymbols[g_trackedCount] = _Symbol;
      g_trackedCount++;
   }
}

//+------------------------------------------------------------------+
//| Sync state with Bridge and receive AI commands                   |
//+------------------------------------------------------------------+
void SyncWithBridge()
{
   string payload = BuildSyncJson();
   char postData[];
   char resultData[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\n";
   
   StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   // Exclude terminating null char from POST body
   int dataLen = ArraySize(postData) - 1;
   if(dataLen > 0) ArrayResize(postData, dataLen);

   string targetUrl = InpBridgeUrl + "/sync";
   int httpCode = WebRequest("POST", targetUrl, headers, 1500, postData, resultData, resultHeaders);
   
   // Try fallback if primary fails
   if(httpCode == -1 && InpBridgeUrlFallback != "")
   {
      targetUrl = InpBridgeUrlFallback + "/sync";
      httpCode = WebRequest("POST", targetUrl, headers, 1500, postData, resultData, resultHeaders);
   }

   if(httpCode == 200)
   {
      g_lastSyncTime = TimeCurrent();
      // Clear reported execution results
      g_resultCount = 0;

      string responseStr = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      ProcessServerResponse(responseStr);
   }
   else
   {
      // Connection issue or waiting for bridge
      static datetime lastErrLog = 0;
      if(TimeCurrent() - lastErrLog > 10)
      {
         lastErrLog = TimeCurrent();
         Print("Bridge sync waiting... (HTTP code: ", httpCode, ", LastError: ", GetLastError(), ")");
      }
   }
}

//+------------------------------------------------------------------+
//| Build full JSON string of account, open positions, ticks         |
//+------------------------------------------------------------------+
string BuildSyncJson()
{
   string json = "{";
   
   // API Key & Meta
   json += "\"apiKey\":\"" + InpApiKey + "\",";
   json += "\"eaVersion\":\"2.10\",";
   json += "\"mt5Time\":" + IntegerToString((long)TimeCurrent()) + ",";
   json += "\"terminalName\":\"" + EscapeJson(TerminalInfoString(TERMINAL_NAME)) + "\",";
   json += "\"terminalCompany\":\"" + EscapeJson(TerminalInfoString(TERMINAL_COMPANY)) + "\",";
   json += "\"terminalBuild\":" + IntegerToString(TerminalInfoInteger(TERMINAL_BUILD)) + ",";

   // Current Active Chart Info
   json += "\"currentChart\":{";
   json += "\"symbol\":\"" + _Symbol + "\",";
   json += "\"timeframe\":\"" + EnumToString((ENUM_TIMEFRAMES)Period()) + "\",";
   json += "\"digits\":" + IntegerToString(_Digits) + ",";
   json += "\"point\":" + DoubleToString(_Point, _Digits) + ",";
   json += "\"bid\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_BID), _Digits) + ",";
   json += "\"ask\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_ASK), _Digits) + ",";
   json += "\"spread\":" + IntegerToString((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD)) + ",";
   json += "\"minLot\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), 2) + ",";
   json += "\"maxLot\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX), 2) + ",";
   json += "\"lotStep\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), 2) + ",";
   json += "\"contractSize\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE), 2) + ",";
   json += "\"tickValue\":" + DoubleToString(SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE), 4) + ",";
   json += "\"tradeAllowed\":" + ((SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_DISABLED) ? "true" : "false") + ",";
   json += "\"description\":\"" + EscapeJson(SymbolInfoString(_Symbol, SYMBOL_DESCRIPTION)) + "\",";
   json += "\"currencyBase\":\"" + SymbolInfoString(_Symbol, SYMBOL_CURRENCY_BASE) + "\",";
   json += "\"currencyProfit\":\"" + SymbolInfoString(_Symbol, SYMBOL_CURRENCY_PROFIT) + "\"";
   json += "},";

   // All Tracked Symbols Detailed Info
   json += "\"allSymbols\":[";
   for(int s = 0; s < g_trackedCount; s++)
   {
      string sym = g_trackedSymbols[s];
      if(SymbolSelect(sym, true))
      {
         if(s > 0) json += ",";
         int sDigits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         json += "{";
         json += "\"symbol\":\"" + sym + "\",";
         json += "\"bid\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_BID), sDigits) + ",";
         json += "\"ask\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_ASK), sDigits) + ",";
         json += "\"spread\":" + IntegerToString((int)SymbolInfoInteger(sym, SYMBOL_SPREAD)) + ",";
         json += "\"digits\":" + IntegerToString(sDigits) + ",";
         json += "\"point\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_POINT), sDigits) + ",";
         json += "\"minLot\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 2) + ",";
         json += "\"maxLot\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX), 2) + ",";
         json += "\"lotStep\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), 2) + ",";
         json += "\"contractSize\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE), 2) + ",";
         json += "\"tradeAllowed\":" + ((SymbolInfoInteger(sym, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_DISABLED) ? "true" : "false") + ",";
         json += "\"isCurrentChart\":" + (sym == _Symbol ? "true" : "false");
         json += "}";
      }
   }
   json += "],";

   // Account Info
   json += "\"account\":{";
   json += "\"login\":" + IntegerToString(m_account.Login()) + ",";
   json += "\"tradeMode\":\"" + EnumToString(m_account.TradeMode()) + "\",";
   json += "\"balance\":" + DoubleToString(m_account.Balance(), 2) + ",";
   json += "\"equity\":" + DoubleToString(m_account.Equity(), 2) + ",";
   json += "\"margin\":" + DoubleToString(m_account.Margin(), 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(m_account.FreeMargin(), 2) + ",";
   json += "\"marginLevel\":" + DoubleToString(m_account.MarginLevel(), 2) + ",";
   json += "\"leverage\":" + IntegerToString(m_account.Leverage()) + ",";
   json += "\"currency\":\"" + m_account.Currency() + "\",";
   json += "\"server\":\"" + m_account.Server() + "\",";
   json += "\"company\":\"" + m_account.Company() + "\",";
   json += "\"profit\":" + DoubleToString(m_account.Profit(), 2) + ",";
   json += "\"lastUpdate\":" + IntegerToString((long)TimeCurrent());
   json += "},";

   // Open Positions
   json += "\"positions\":[";
   int totalPositions = PositionsTotal();
   int addedPositions = 0;
   for(int i = 0; i < totalPositions; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         if(addedPositions > 0) json += ",";
         json += "{";
         json += "\"ticket\":" + IntegerToString(ticket) + ",";
         json += "\"symbol\":\"" + m_position.Symbol() + "\",";
         json += "\"type\":\"" + (m_position.PositionType() == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\",";
         json += "\"volume\":" + DoubleToString(m_position.Volume(), 2) + ",";
         json += "\"openPrice\":" + DoubleToString(m_position.PriceOpen(), 5) + ",";
         json += "\"currentPrice\":" + DoubleToString(m_position.PriceCurrent(), 5) + ",";
         json += "\"sl\":" + DoubleToString(m_position.StopLoss(), 5) + ",";
         json += "\"tp\":" + DoubleToString(m_position.TakeProfit(), 5) + ",";
         json += "\"profit\":" + DoubleToString(m_position.Profit(), 2) + ",";
         json += "\"swap\":" + DoubleToString(m_position.Swap(), 2) + ",";
         json += "\"magic\":" + IntegerToString(m_position.Magic()) + ",";
         json += "\"comment\":\"" + EscapeJson(m_position.Comment()) + "\",";
         json += "\"openTime\":" + IntegerToString((long)m_position.Time());
         json += "}";
         addedPositions++;
      }
   }
   json += "],";

   // Ticks for tracked symbols
   json += "\"ticks\":[";
   int addedTicks = 0;
   for(int s = 0; s < g_trackedCount; s++)
   {
      string sym = g_trackedSymbols[s];
      if(SymbolSelect(sym, true))
      {
         MqlTick tick;
         if(SymbolInfoTick(sym, tick))
         {
            if(addedTicks > 0) json += ",";
            int spread = (int)SymbolInfoInteger(sym, SYMBOL_SPREAD);
            json += "{";
            json += "\"symbol\":\"" + sym + "\",";
            json += "\"bid\":" + DoubleToString(tick.bid, 5) + ",";
            json += "\"ask\":" + DoubleToString(tick.ask, 5) + ",";
            json += "\"last\":" + DoubleToString(tick.last, 5) + ",";
            json += "\"spread\":" + IntegerToString(spread) + ",";
            json += "\"volume\":" + IntegerToString((long)tick.volume) + ",";
            json += "\"time\":" + IntegerToString((long)tick.time);
            json += "}";
            addedTicks++;
         }
      }
   }
   json += "],";

   // Report execution results
   json += "\"pendingExecutionResults\":[";
   for(int r = 0; r < g_resultCount; r++)
   {
      if(r > 0) json += ",";
      json += "{";
      json += "\"commandId\":\"" + g_resultQueue[r].commandId + "\",";
      json += "\"success\":" + (g_resultQueue[r].success ? "true" : "false") + ",";
      json += "\"dealTicket\":" + IntegerToString(g_resultQueue[r].dealTicket) + ",";
      json += "\"orderTicket\":" + IntegerToString(g_resultQueue[r].orderTicket) + ",";
      json += "\"executionPrice\":" + DoubleToString(g_resultQueue[r].executionPrice, 5) + ",";
      json += "\"errorCode\":" + IntegerToString(g_resultQueue[r].errorCode) + ",";
      json += "\"errorMessage\":\"" + EscapeJson(g_resultQueue[r].errorMessage) + "\",";
      json += "\"executionTimeMs\":" + IntegerToString(g_resultQueue[r].executionTimeMs);
      json += "}";
   }
   json += "]";

   json += "}";
   return json;
}

//+------------------------------------------------------------------+
//| Simple string escape for JSON                                    |
//+------------------------------------------------------------------+
string EscapeJson(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\r", "");
   StringReplace(s, "\n", " ");
   return s;
}

//+------------------------------------------------------------------+
//| Parse commands array and execute asynchronously                  |
//+------------------------------------------------------------------+
void ProcessServerResponse(string json)
{
   int cmdStart = StringFind(json, "\"commands\":");
   if(cmdStart == -1) return;
   
   int arrStart = StringFind(json, "[", cmdStart);
   int arrEnd = StringFind(json, "]", arrStart);
   if(arrStart == -1 || arrEnd == -1 || arrEnd <= arrStart + 1) return;

   string commandsSub = StringSubstr(json, arrStart + 1, arrEnd - arrStart - 1);
   StringTrimLeft(commandsSub);
   StringTrimRight(commandsSub);
   if(StringLen(commandsSub) == 0) return;

   // Process individual command objects inside the array
   int pos = 0;
   while(pos < StringLen(commandsSub))
   {
      int objStart = StringFind(commandsSub, "{", pos);
      if(objStart == -1) break;
      int objEnd = StringFind(commandsSub, "}", objStart);
      if(objEnd == -1) break;

      string cmdObj = StringSubstr(commandsSub, objStart, objEnd - objStart + 1);
      ExecuteSingleCommand(cmdObj);
      pos = objEnd + 1;
   }
}

//+------------------------------------------------------------------+
//| Execute a parsed command                                         |
//+------------------------------------------------------------------+
void ExecuteSingleCommand(string cmd)
{
   uint startTick = GetTickCount();

   string id = ExtractJsonField(cmd, "id");
   string action = ExtractJsonField(cmd, "action");
   string symbol = ExtractJsonField(cmd, "symbol");
   string orderType = ExtractJsonField(cmd, "orderType");
   double volume = StringToDouble(ExtractJsonField(cmd, "volume"));
   double sl = StringToDouble(ExtractJsonField(cmd, "sl"));
   double tp = StringToDouble(ExtractJsonField(cmd, "tp"));
   ulong ticket = (ulong)StringToInteger(ExtractJsonField(cmd, "ticket"));
   ulong magic = (ulong)StringToInteger(ExtractJsonField(cmd, "magic"));
   string comment = ExtractJsonField(cmd, "comment");

   if(symbol == "") symbol = _Symbol;
   if(magic == 0) magic = InpMagicNumber;
   if(comment == "") comment = "AI_ORDER";

   m_trade.SetExpertMagicNumber(magic);

   bool success = false;
   ulong dealTicket = 0;
   ulong orderTicket = 0;
   double execPrice = 0.0;
   int errCode = 0;
   string errMsg = "";

   Print(">>> EXECUTING AI COMMAND: ", action, " [ID: ", id, "] Symbol: ", symbol, " Type: ", orderType, " Vol: ", volume);

   if(action == "EXECUTE_TRADE")
   {
      if(!SymbolSelect(symbol, true))
      {
         errCode = 4106;
         errMsg = "Unknown symbol " + symbol;
      }
      else
      {
         // Auto-detect broker supported order filling mode
         uint filling = (uint)SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE);
         if((filling & SYMBOL_FILLING_IOC) != 0) m_trade.SetTypeFilling(ORDER_FILLING_IOC);
         else if((filling & SYMBOL_FILLING_FOK) != 0) m_trade.SetTypeFilling(ORDER_FILLING_FOK);
         else m_trade.SetTypeFilling(ORDER_FILLING_RETURN);

         int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
         double minLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
         double maxLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
         double stepLot = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
         if(stepLot > 0) volume = MathFloor(volume / stepLot) * stepLot;
         if(volume < minLot) volume = minLot;
         if(volume > maxLot) volume = maxLot;
         volume = NormalizeDouble(volume, 2);

         if(sl > 0) sl = NormalizeDouble(sl, digits);
         if(tp > 0) tp = NormalizeDouble(tp, digits);

         MqlTick tick;
         SymbolInfoTick(symbol, tick);

         if(orderType == "BUY")
         {
            execPrice = tick.ask;
            success = m_trade.Buy(volume, symbol, execPrice, sl, tp, comment);
         }
         else if(orderType == "SELL")
         {
            execPrice = tick.bid;
            success = m_trade.Sell(volume, symbol, execPrice, sl, tp, comment);
         }

         if(success)
         {
            dealTicket = m_trade.ResultDeal();
            orderTicket = m_trade.ResultOrder();
            execPrice = m_trade.ResultPrice();
            Print("AI/MANUAL TRADE EXECUTED: Deal #", dealTicket, " at ", execPrice, " (", orderType, " ", volume, " ", symbol, ")");
         }
         else
         {
            errCode = (int)m_trade.ResultRetcode();
            errMsg = m_trade.ResultRetcodeDescription();
            Print("TRADE FAILED: ", errMsg, " (Code: ", errCode, ")");
         }
      }
   }
   else if(action == "MODIFY_POSITION")
   {
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         string posSym = m_position.Symbol();
         int digits = (int)SymbolInfoInteger(posSym, SYMBOL_DIGITS);
         if(sl > 0) sl = NormalizeDouble(sl, digits);
         if(tp > 0) tp = NormalizeDouble(tp, digits);
         success = m_trade.PositionModify(ticket, sl, tp);
         if(success)
         {
            Print("POSITION MODIFIED: #", ticket, " SL: ", sl, " TP: ", tp);
         }
         else
         {
            errCode = (int)m_trade.ResultRetcode();
            errMsg = m_trade.ResultRetcodeDescription();
         }
      }
      else
      {
         errCode = 4753;
         errMsg = "Position not found: " + IntegerToString(ticket);
      }
   }
   else if(action == "CLOSE_POSITION")
   {
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         if(volume > 0 && volume < m_position.Volume())
         {
            success = m_trade.PositionClosePartial(ticket, volume);
         }
         else
         {
            success = m_trade.PositionClose(ticket);
         }

         if(success)
         {
            dealTicket = m_trade.ResultDeal();
            Print("AI POSITION CLOSED: #", ticket);
         }
         else
         {
            errCode = (int)m_trade.ResultRetcode();
            errMsg = m_trade.ResultRetcodeDescription();
         }
      }
      else
      {
         errCode = 4753;
         errMsg = "Position ticket not found: " + IntegerToString(ticket);
      }
   }
   else if(action == "CLOSE_ALL")
   {
      int closedCount = 0;
      int total = PositionsTotal();
      for(int i = total - 1; i >= 0; i--)
      {
         ulong t = PositionGetTicket(i);
         if(t > 0 && m_position.SelectByTicket(t))
         {
            if(symbol == "" || symbol == "ALL" || m_position.Symbol() == symbol)
            {
               if(m_trade.PositionClose(t)) closedCount++;
            }
         }
      }
      success = true;
      errMsg = "Closed " + IntegerToString(closedCount) + " positions";
   }

   // Record result in queue to inform Bridge
   if(g_resultCount < 20)
   {
      g_resultQueue[g_resultCount].commandId = id;
      g_resultQueue[g_resultCount].success = success;
      g_resultQueue[g_resultCount].dealTicket = dealTicket;
      g_resultQueue[g_resultCount].orderTicket = orderTicket;
      g_resultQueue[g_resultCount].executionPrice = execPrice;
      g_resultQueue[g_resultCount].errorCode = errCode;
      g_resultQueue[g_resultCount].errorMessage = errMsg;
      g_resultQueue[g_resultCount].executionTimeMs = (int)(GetTickCount() - startTick);
      g_resultCount++;
   }
}

//+------------------------------------------------------------------+
//| Extract field value from simple flat JSON string                 |
//+------------------------------------------------------------------+
string ExtractJsonField(string json, string key)
{
   string needle = "\"" + key + "\":";
   int pos = StringFind(json, needle);
   if(pos == -1) return "";

   int start = pos + StringLen(needle);
   while(start < StringLen(json) && (StringGetCharacter(json, start) == ' ' || StringGetCharacter(json, start) == '\"'))
   {
      start++;
   }

   int end = start;
   bool inQuotes = (StringGetCharacter(json, pos + StringLen(needle)) == '\"' || StringGetCharacter(json, pos + StringLen(needle) + 1) == '\"');
   
   while(end < StringLen(json))
   {
      ushort c = StringGetCharacter(json, end);
      if(inQuotes && c == '\"') break;
      if(!inQuotes && (c == ',' || c == '}' || c == ']' || c == '\r' || c == '\n')) break;
      end++;
   }

   return StringSubstr(json, start, end - start);
}

//+------------------------------------------------------------------+
//| Dynamic Trailing Stop Engine                                     |
//+------------------------------------------------------------------+
void ProcessTrailingStops()
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && m_position.SelectByTicket(ticket))
      {
         string sym = m_position.Symbol();
         double point = SymbolInfoDouble(sym, SYMBOL_POINT);
         int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         
         double distance = InpTrailingPoints * point;
         double step = InpTrailingStep * point;
         
         if(m_position.PositionType() == POSITION_TYPE_BUY)
         {
            double bid = SymbolInfoDouble(sym, SYMBOL_BID);
            if(bid - m_position.PriceOpen() > distance)
            {
               double newSL = NormalizeDouble(bid - distance, digits);
               if(m_position.StopLoss() == 0 || (newSL - m_position.StopLoss() >= step))
               {
                  m_trade.PositionModify(ticket, newSL, m_position.TakeProfit());
                  Print("BUY Trailing Stop updated for #", ticket, " New SL: ", newSL);
               }
            }
         }
         else if(m_position.PositionType() == POSITION_TYPE_SELL)
         {
            double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
            if(m_position.PriceOpen() - ask > distance)
            {
               double newSL = NormalizeDouble(ask + distance, digits);
               if(m_position.StopLoss() == 0 || (m_position.StopLoss() - newSL >= step))
               {
                  m_trade.PositionModify(ticket, newSL, m_position.TakeProfit());
                  Print("SELL Trailing Stop updated for #", ticket, " New SL: ", newSL);
               }
            }
         }
      }
   }
}
//+------------------------------------------------------------------+
