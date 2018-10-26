// #bridgeForm
// #bridgeAmountFrom
// #bridgeCurrency
// #bridgeCurrenciesList
// #bridgeAmountTo
// #bridgeSubmit

var Modal = (function(jq, d) {
    var GrapheneConnection = function() {
        this.getBaseUrl = function() {
            return "https://moscow.localcoin.is/";
        }

        this.send = function(cb, method, params) {
            xhr = new XMLHttpRequest();            
            xhr.open("POST", this.getBaseUrl(), true);
            xhr.setRequestHeader("Content-type", "application/json");
            xhr.onreadystatechange = function () {
                try {
                    var json  = xhr.responseText;
                    var array = JSON.parse(json);
                    cb(array);
                } catch(e) { }
            }
            var data = JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: method,
                params: params
            });
            xhr.send(data);
        }

        this.isNameExists = function(username, cb) {
            this.send(function(data) {
                cb({
                    username: username,
                    isExist:  data.result !== null
                });
            }, "get_account_by_name", [username]);
        };        
    };

    var LLCGatewayConnection = function() {        
        const MODE_BRIDGE = "1";

        this.getBaseUrl = function() {
            return "https://llcgateway.localcoin.is/";
        }

        this.encodeQueryData = function(data) {
            let ret = [];
            for (let d in data)
                ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(data[d]));
            return ret.join("&");
        }

        this.ajax = function(cb, action, params) {
            if (typeof params === "undefined") params = null;
            let url = this.getBaseUrl() + "?methodnameaction=" + action;
            if (params) url += "&" + this.encodeQueryData(params);

            jq.ajax({
                method:  "GET",
                url:     url,
                data:    params,
                success: function(json) {
                    cb(JSON.parse(json));
                }
            });
        };

        this.loadCurrencies = function(cb) {
            this.ajax(function(data) {
                cb(data.deposit);
            }, "GetAllowCurrency");
        };

        this.loadPairsCourse = function(cb) {
            this.ajax(function(data) {
                cb(data.list);
            }, "GetPairsCourse");
        };

        this.generateBridgeHash = function(username, asset, cb) {
            this.ajax(function(data) {                
                cb(data);
            }, "CreatePaymentAddress", {
                account: username,
                asset:   asset,
                type:    MODE_BRIDGE
            });
        };
    };

    return function() {
        this.gateConnection = null;
        this.grapheneConnection = null;
        this.pairsCourse = null;
        this.currencies = null;

        this.init = function() {
            var self = this;
            this.gateConnection = new LLCGatewayConnection();
            this.grapheneConnection = new GrapheneConnection();

            //доступные монеты            
            this.clearCurrenciesList();
            this.gateConnection.loadCurrencies(function(currencies) {
                self.currencies = currencies;

                for(var i in currencies)
                    self.addItemInCurrenciesList(currencies[i].asset, currencies[i].forBTCService);
            });
            //****************

            //обновление курса
            var updateCourse = function() {
                self.gateConnection.loadPairsCourse(function(pairs) {
                    self.pairsCourse = pairs;                    
                });
            };
            updateCourse(); //setInterval(updateCourse, 2000);//курс может изменяться каждые 2 минуты
            //****************

            //onchange селект монет
            jq(d).on("click", "#bridgeCurrenciesList li", function() {
                var key = jq(this).attr("data-value");
                var value = jq(this).html();
                self.setActive(key, value);
                jq("#bridgeCurrenciesList").attr("style", "");
            });
            //*********************

            //конвертер
            var recalc = function() {
                var value = jq("#bridgeAmountFrom").val();
                var converted = self.getConvertAmount("LLC", self.getActive(), value);
                jq("#bridgeAmountTo").val(converted.toFixed(5));
            };
            jq(d).on("mouseup", "#bridgeAmountFrom",               recalc);
            jq(d).on("keyup",   "#bridgeAmountFrom",               recalc);
            jq(d).on("click",   "#bridgeCurrenciesList", function() { setTimeout(recalc, 100); });
            //*********

            //валидатор логина в блокчейне
            var checkUsername = function(successCB) {
                var username = jq("#grapheneUsername").val();
                if(username.length <= 3) {                    
                    self.usernameIsFound();
                    
                    if(typeof successCB === "function") {
                        var error = jq("#translate-emptylogin-error").val();
                        jq("#loginError").html(error);
                    }
                    
                    return;
                }

                self.grapheneConnection.isNameExists(username, function(response) {
                    if(jq("#grapheneUsername").val() != response.username) return;

                    if(response.isExist) self.usernameIsFound();
                    else {  self.usernameNotFound();
                            return; }

                    if(typeof successCB === "function") successCB();
                });
            };
            // jq(d).on("mouseup", "#grapheneUsername", checkUsername);
            // jq(d).on("keyup",   "#grapheneUsername", checkUsername);
            jq(d).on("mouseup", "#grapheneUsername", function() { jq("#loginError").html(""); });
            jq(d).on("keyup",   "#grapheneUsername", function() { jq("#loginError").html(""); });
            //****************************

            //prev-coin next-coin                        
            jq(d).on("click", ".prev-coin", function() {
                setTimeout(function() {
                    jq('.select_in.select-coin_in').click();
                }, 100);
            });

            jq(d).on("click", ".next-coin", function() {
                setTimeout(function() {
                    jq('.select_in.select-coin_in').click();
                }, 100);
            });
            //*******************

            //submit
            jq(d).on("click", "#bridgeSubmit", function() {
                checkUsername(function() {
                    var username = jq("#grapheneUsername").val();
                    $("#accountName").html(username);
                    $("#accountName").attr("href", "https://wallet.localcoin.is/account/" + username);
                    
                    self.gateConnection.generateBridgeHash(username, self.getActive(), function(hashData) {
                        if(hashData.status !== "success") {
                            alert(hashData.errorMessage);
                            return;
                        }
        
                        self.showAddress(hashData.asset, hashData.address, self.getMinimalAmount(hashData.asset));
                    });
                });

                return false;
            });
            //******
        };

        this.hideAddress = function() {
            jq("#bridgeFormInput").show();
            jq("#bridgeFormAddress").hide();
        };

        this.showAddress = function(asset, address, minimalAmount) {
            jq("#bridgeFormInput").hide();
            jq("#bridgeFormAddress").show();

            jq("#bridgeFormInputAsset").html(asset);
            jq("#bridgeFormInputAddress").html(address);
            jq("#bridgeFormInputMinimalAmount a").html(minimalAmount);            
        };

        this.usernameNotFound = function() {
            jq("#loginError").html(jq("#translate-login-error").val());
        };

        this.usernameIsFound = function() {
            jq("#loginError").html("");
        };

        this.getConvertAmount = function(from, to, amount) {
            if(this.pairsCourse)
                for(var i in this.pairsCourse) {
                    var item = this.pairsCourse[i];

                    if(item.from != from) continue;
                    if(item.to   != to)   continue;
                    
                    var numberAmount = parseFloat((amount + "").replace(",", "."));                    
                    return item.coef * numberAmount;
                }

            alert(jq("#translate-course-error-load").val());
            return null;
        };

        this.clearCurrenciesList = function() {
            jq("#bridgeCurrenciesList").html("");
        };

        this.addItemInCurrenciesList = function(key, value) {
            var before = jq("#bridgeCurrenciesList").html();
            var li = '<li data-value="' + key + '">' + value + '</li>';

            jq("#bridgeCurrenciesList").html(before + li);
        };

        this.reset = function() {
            jq("#bridgeCurrenciesList").attr("style", "");
            this.hideAddress();
        };

        this.getMinimalAmount = function(asset) {
            for(var i in this.currencies) {
                var item = this.currencies[i];
                if(item.asset.toLowerCase() !== asset.toLowerCase()) continue;
                return item.minimal;
            }
            
            return -1;
        };

        this.getActive = function() {
            return jq("#bridgeCurrency").val() == "" ? "BTC" : jq("#bridgeCurrency").val();
        };

        this.setActive = function(key, value) {
            jq("#bridgeCurrenciesList li").each(function() {
                jq(this).attr("class", "");
            });

            jq("#bridgeCurrenciesList li[data-value=" + key + "]").attr("class", "is-active");

            jq('.select_title.select-coin_title').html(value);
            jq("#bridgeCurrency").val(key);
        };
    };    
})($, document);

$(document).ready(function() {
    var modal = new Modal();
    modal.init();

    $(document).on("mousedown", "#buy_coin_header", function() {
        modal.reset();
    });
});