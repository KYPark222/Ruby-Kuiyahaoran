require "test_helper"

class PachinkoEntriesControllerTest < ActionDispatch::IntegrationTest
  test "adds a hold and draws once per ball" do
    post pachinko_entry_path, params: { ball_id: "ball-101" }, as: :json
    first = response.parsed_body

    assert_response :success
    assert_equal true, first["accepted"]
    assert_equal 1, first["hold_count"]
    assert_includes %w[jackpot miss], first["result"]

    post pachinko_entry_path, params: { ball_id: "ball-101" }, as: :json
    assert_response :success
    assert_equal true, response.parsed_body["duplicate"]
    assert_equal 1, response.parsed_body["hold_count"]
  end

  test "does not add a fifth hold" do
    4.times do |index|
      post pachinko_entry_path, params: { ball_id: "ball-#{index}" }, as: :json
      assert_response :success
      assert_equal index + 1, response.parsed_body["hold_count"]
    end

    post pachinko_entry_path, params: { ball_id: "ball-full" }, as: :json
    assert_response :success
    assert_equal true, response.parsed_body["full"]
    assert_equal 4, response.parsed_body["hold_count"]
  end

  test "restores the session hold display and reset clears it" do
    post pachinko_entry_path, params: { ball_id: "before-reset" }, as: :json
    get root_path
    assert_select ".hold-summary small", "1 / 4"
    assert_select ".lcd-holds .hold-on", count: 1

    post pachinko_reset_path
    assert_response :no_content
    get root_path
    assert_select ".hold-summary small", "0 / 4"
    assert_select ".lcd-holds .hold-on", count: 0
  end
end
