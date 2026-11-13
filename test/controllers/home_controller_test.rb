require "test_helper"

class HomeControllerTest < ActionDispatch::IntegrationTest
  test "renders the board, live game dashboard, and unconnected controls" do
    get root_path

    assert_response :success
    assert_select "svg.board-component-map"
    assert_select "canvas[data-physics-canvas]"
    assert_select ".physics-rail", count: 11
    assert_select ".physics-rail#R002", count: 1
    assert_select ".physics-rail#R003", count: 1
    assert_select ".physics-rail#heso-funnel-left", count: 1
    assert_select ".physics-rail#heso-funnel-right", count: 1
    assert_select ".physics-rail#lcd-collider", count: 1
    assert_select ".physics-rail#lcd-side-guide-left", count: 1
    assert_select ".physics-rail#lcd-side-guide-right", count: 1
    assert_select "[data-physics-disabled='true']", count: 4
    assert_select "#left-outer-rail[data-physics-disabled='true']", count: 0
    assert_select ".physics-rail#left-outer-rail", count: 1
    assert_select ".physics-rail#right-board-boundary[data-physics-role='board-boundary']", count: 1
    assert_select ".lcd-guard[data-physics-disabled='true']", count: 4
    assert_select ".lcd-guard", count: 4
    assert_select ".physics-pin", count: 84
    assert_select ".physics-pin#lower-1-7", count: 0
    assert_select ".physics-pin#lower-1-8", count: 0
    assert_select ".physics-pin#N101", count: 1
    assert_select ".physics-pin#N102", count: 1
    assert_select ".physics-pin#N103", count: 1
    assert_select ".physics-pin#N104", count: 1
    assert_select ".physics-pin[cy='363']", count: 0
    assert_select ".physics-pin[cy='404']", count: 0
    assert_select ".physics-pin[cy='320']", count: 0
    assert_select "[data-physics-role='award-gate']", count: 1
    assert_select "section#lcd-interface[data-lcd-state='normal']"
    assert_select "#symbol-reels [data-symbol-column]", count: 3
    assert_select "#lcd-message"
    assert_select "#lcd-holds i", count: 4
    assert_select ".board-callout", count: 6
    assert_select ".money-grid div", count: 4
    assert_select "#current-balls"
    assert_select "#invested-yen"
    assert_select "#payout-balls"
    assert_select "#difference-balls"
    assert_select "#balance-yen"
    assert_select ".stat-grid div", count: 7
    assert_select "#normal-spins"
    assert_select "#st-spins"
    assert_select "#first-hits"
    assert_select "#lush-entries"
    assert_select "#current-streak"
    assert_select "#max-streak"
    assert_select "#launched-balls"
    assert_select "#balance-chart-panel"
    assert_select "#balance-chart-line"
    assert_select "#balance-chart-area"
    assert_select "#balance-chart-zero"
    assert_select "#balance-chart-current"
    assert_select ".history-list li.history-empty", count: 1
    assert_select "#jackpot-history"
    assert_select "#jackpot-count", text: "0"
    assert_select ".live-tag", text: "LIVE"
    assert_select "body", text: /SAMPLE/, count: 0
    assert_select ".strength-button", count: 2
    assert_select "button[data-launch-mode='left']", text: "左打ち"
    assert_select "button[data-launch-mode='right']", text: "右打ち"
    assert_select ".action-button", count: 4
    assert_select "button[data-simulation-action='invest']", count: 1
    assert_select "fieldset[disabled]", count: 0
    assert_select "input[type='range'][id='launch-power']", count: 0
    assert_select "input[type='number'][id='target-hit-rate']", count: 1
    assert_select "button[id='apply-target-rate']", count: 1
    assert_select "#target-rate-status", /未設定/
    assert_select "#physics-left-stats"
    assert_select "#physics-right-stats"
    assert_select "script[src*='game_ui']"
    assert_select "script[src*='matter.min']"
    assert_select "script[src*='pachinko_physics_config']"
    assert_select "script[src*='pachinko_entry_detector']"
    assert_select "script[src*='pachinko_trial_stats']"
    assert_select "script[src*='pachinko_physics']"
    assert_select "body", /持ち玉/
    assert_select "body", /累計払出/
    assert_select "body", /通常回転数/
    assert_select "body", /初当たり/
    assert_select "body", /LUSH突入/
    assert_select "body", /最高連チャン/
    assert_select "body", /累計打ち出し数/
    assert_select "body", /収支の推移/
    assert_select "body", /大当たりデータ/
  end
end
